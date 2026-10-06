import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { db } from '../db/connection';
import { getCurrentISTDateString } from '../utils/time';

export async function getMonthlyReportData(year?: number, month?: number) {
  const now = new Date();
  const targetYear = year || now.getFullYear();
  const targetMonth = month || now.getMonth() + 1; // 1-indexed

  const monthStr = String(targetMonth).padStart(2, '0');
  const startDate = `${targetYear}-${monthStr}-01`;
  const lastDay = new Date(targetYear, targetMonth, 0).getDate();
  const endDate = `${targetYear}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

  // 1. Daily meals served
  const dailyMeals = await db('meal_log')
    .where('result', 'APPROVED')
    .where('meal_date', '>=', startDate)
    .where('meal_date', '<=', endDate)
    .select('meal_date')
    .count('id as count')
    .groupBy('meal_date')
    .orderBy('meal_date', 'asc');

  // 2. Plans sold this month
  const plansSold = await db('student_plans as sp')
    .join('plans as p', 'sp.plan_id', 'p.id')
    .join('admin_users as a', 'sp.sold_by', 'a.id')
    .whereRaw('DATE(sp.created_at) >= ?', [startDate])
    .whereRaw('DATE(sp.created_at) <= ?', [endDate])
    .select(
      'sp.id',
      'sp.created_at',
      'p.name as plan_name',
      'sp.tokens_total',
      'sp.amount_paid_inr',
      'sp.payment_mode',
      'a.name as sold_by_name'
    )
    .orderBy('sp.created_at', 'desc');

  // 3. Total revenue this month
  const totalRevenue = plansSold.reduce((acc, p) => acc + Number(p.amount_paid_inr), 0);

  // 4. Manual entries by staff
  const manualByStaff = await db('meal_log as ml')
    .leftJoin('admin_users as a', 'ml.marked_by', 'a.id')
    .where('ml.method', 'MANUAL')
    .where('ml.result', 'APPROVED')
    .where('ml.meal_date', '>=', startDate)
    .where('ml.meal_date', '<=', endDate)
    .select(db.raw("COALESCE(a.name, 'System / Unspecified') as staff_name"))
    .count('ml.id as count')
    .groupBy('staff_name')
    .orderBy('count', 'desc');

  const totalMeals = dailyMeals.reduce((acc, d) => acc + Number(d.count), 0);

  return {
    year: targetYear,
    month: targetMonth,
    startDate,
    endDate,
    totalMeals,
    totalRevenue,
    plansCount: plansSold.length,
    dailyMeals,
    plansSold,
    manualByStaff,
  };
}

export async function generateExcelReport(data: any): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Mess Tokens System';
  workbook.created = new Date();

  // Sheet 1: Summary & Daily Meals
  const sheet1 = workbook.addWorksheet('Monthly Summary');
  sheet1.columns = [
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Meals Served', key: 'count', width: 15 },
  ];

  for (const d of data.dailyMeals) {
    sheet1.addRow({ date: d.meal_date, count: Number(d.count) });
  }

  // Sheet 2: Plans Sold
  const sheet2 = workbook.addWorksheet('Plans Sold');
  sheet2.columns = [
    { header: 'Sale Date', key: 'date', width: 15 },
    { header: 'Plan Name', key: 'plan', width: 25 },
    { header: 'Tokens', key: 'tokens', width: 10 },
    { header: 'Amount (INR)', key: 'amount', width: 15 },
    { header: 'Mode', key: 'mode', width: 10 },
    { header: 'Sold By', key: 'staff', width: 20 },
  ];

  for (const p of data.plansSold) {
    sheet2.addRow({
      date: new Date(p.created_at).toISOString().split('T')[0],
      plan: p.plan_name,
      tokens: p.tokens_total,
      amount: p.amount_paid_inr,
      mode: p.payment_mode,
      staff: p.sold_by_name,
    });
  }

  // Sheet 3: Manual Entries by Staff
  const sheet3 = workbook.addWorksheet('Manual Entries');
  sheet3.columns = [
    { header: 'Staff Member', key: 'staff', width: 25 },
    { header: 'Manual Meals Marked', key: 'count', width: 20 },
  ];

  for (const m of data.manualByStaff) {
    sheet3.addRow({ staff: m.staff_name, count: Number(m.count) });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function generatePdfReport(data: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));

    // Title & Header
    doc.fontSize(20).text('Mess Tokens — Monthly Report', { align: 'center' });
    doc.fontSize(10).text(`Period: ${data.startDate} to ${data.endDate}`, { align: 'center' });
    doc.moveDown(1.5);

    // Summary Statistics
    doc.fontSize(14).text('Summary Overview', { underline: true });
    doc.fontSize(11);
    doc.text(`Total Meals Served: ${data.totalMeals}`);
    doc.text(`Total Revenue Collected: INR ${Number(data.totalRevenue).toLocaleString('en-IN')}`);
    doc.text(`Total Plans Sold: ${data.plansCount}`);
    doc.moveDown(1.5);

    // Manual Entries by Staff
    doc.fontSize(14).text('Manual Meal Entries by Staff', { underline: true });
    doc.fontSize(10);
    if (data.manualByStaff.length === 0) {
      doc.text('No manual meals recorded.');
    } else {
      for (const m of data.manualByStaff) {
        doc.text(`${m.staff_name}: ${m.count} meals`);
      }
    }
    doc.moveDown(1.5);

    // Daily breakdown
    doc.fontSize(14).text('Daily Meals Breakdown', { underline: true });
    doc.fontSize(9);
    for (const d of data.dailyMeals) {
      doc.text(`${d.meal_date}: ${d.count} meals`);
    }

    doc.end();
  });
}
