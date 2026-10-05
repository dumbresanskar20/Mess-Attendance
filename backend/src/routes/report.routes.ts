import { Router, Request, Response, NextFunction } from 'express';
import { authenticateJWT, requireRole } from '../middlewares/auth.middleware';
import * as reportService from '../services/report.service';

const router = Router();

// Reports are OWNER only
router.use(authenticateJWT, requireRole('OWNER'));

// GET /api/reports/monthly
router.get('/monthly', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined;
    const month = req.query.month ? parseInt(req.query.month as string, 10) : undefined;
    const format = req.query.format as string | undefined;

    const reportData = await reportService.getMonthlyReportData(year, month);

    if (format === 'xlsx') {
      const buffer = await reportService.generateExcelReport(reportData);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="monthly_report_${reportData.year}_${reportData.month}.xlsx"`
      );
      res.send(buffer);
      return;
    }

    if (format === 'pdf') {
      const buffer = await reportService.generatePdfReport(reportData);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="monthly_report_${reportData.year}_${reportData.month}.pdf"`
      );
      res.send(buffer);
      return;
    }

    res.json(reportData);
  } catch (error) {
    next(error);
  }
});

export default router;
