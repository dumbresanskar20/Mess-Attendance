import React, { useState, useEffect } from 'react';
import { CreditCard, Plus, Edit, Check, AlertCircle } from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { Skeleton } from '../components/common/Skeleton';
import { Plan } from '../types';

export const PlansPage: React.FC = () => {
  const { isOwner } = useAuth();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [name, setName] = useState('');
  const [priceInr, setPriceInr] = useState<number>(3000);
  const [tokens, setTokens] = useState<number>(60);
  const [validityDays, setValidityDays] = useState<number>(30);
  const [mealsPerDay, setMealsPerDay] = useState<number>(2);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<Plan[]>('/plans');
      setPlans(data);
    } catch (e) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const openCreateModal = () => {
    setEditingPlan(null);
    setName('');
    setPriceInr(3300);
    setTokens(60);
    setValidityDays(30);
    setMealsPerDay(2);
    setIsActive(true);
    setError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (plan: Plan) => {
    setEditingPlan(plan);
    setName(plan.name);
    setPriceInr(plan.price_inr);
    setTokens(plan.tokens);
    setValidityDays(plan.validity_days);
    setMealsPerDay(plan.meals_per_day);
    setIsActive(plan.is_active);
    setError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (editingPlan) {
        await apiRequest(`/plans/${editingPlan.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name,
            price_inr: priceInr,
            tokens,
            validity_days: validityDays,
            meals_per_day: mealsPerDay,
            is_active: isActive,
          }),
        });
      } else {
        await apiRequest('/plans', {
          method: 'POST',
          body: JSON.stringify({
            name,
            price_inr: priceInr,
            tokens,
            validity_days: validityDays,
            meals_per_day: mealsPerDay,
          }),
        });
      }
      setIsModalOpen(false);
      fetchPlans();
    } catch (err: any) {
      setError(err.message || 'Failed to save plan');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-text">Meal plans</h2>
          <span className="text-xs text-text-muted">
            Configure prepaid packages and pricing
          </span>
        </div>

        {isOwner && (
          <button
            onClick={openCreateModal}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg transition-colors shadow-xs w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Create new plan</span>
          </button>
        )}
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-card" />
          ))
        ) : plans.length === 0 ? (
          <div className="col-span-3 py-12 text-center text-xs text-text-muted">
            No meal plans configured yet.
          </div>
        ) : (
          plans.map((p) => (
            <div
              key={p.id}
              className="p-6 rounded-card bg-surface-elevated border border-border flex flex-col justify-between space-y-4 hover:border-accent/40 transition-colors shadow-xs"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Badge variant={p.is_active ? 'success' : 'neutral'}>
                    {p.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  {isOwner && (
                    <button
                      onClick={() => openEditModal(p)}
                      className="p-1 rounded text-text-muted hover:text-accent hover:bg-surface-subtle transition-colors"
                      title="Edit plan"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <h3 className="text-lg font-bold text-text tracking-tight">{p.name}</h3>
                <div className="text-2xl font-black text-accent mt-2">
                  ₹{Number(p.price_inr).toLocaleString('en-IN')}
                </div>
              </div>

              <div className="space-y-2 pt-3 border-t border-border text-xs">
                <div className="flex items-center justify-between text-text-muted">
                  <span>Tokens</span>
                  <span className="font-bold text-text">{p.tokens} meals</span>
                </div>
                <div className="flex items-center justify-between text-text-muted">
                  <span>Validity</span>
                  <span className="font-bold text-text">{p.validity_days} days</span>
                </div>
                <div className="flex items-center justify-between text-text-muted">
                  <span>Meals per day</span>
                  <span className="font-bold text-text">{p.meals_per_day} meals</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create / Edit Plan Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingPlan ? 'Edit meal plan' : 'Create new meal plan'}
      >
        {error && (
          <div className="mb-4 p-3 rounded bg-danger-subtle text-danger border border-danger-border text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1">Plan name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Monthly Standard (30 Days)"
              className="w-full px-3 py-2 bg-surface text-xs rounded-lg border border-border"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Price (₹) *</label>
              <input
                type="number"
                required
                min={0}
                value={priceInr}
                onChange={(e) => setPriceInr(Number(e.target.value))}
                className="w-full px-3 py-2 bg-surface text-xs rounded-lg border border-border font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Tokens *</label>
              <input
                type="number"
                required
                min={1}
                value={tokens}
                onChange={(e) => setTokens(Number(e.target.value))}
                className="w-full px-3 py-2 bg-surface text-xs rounded-lg border border-border font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Validity (days) *</label>
              <input
                type="number"
                required
                min={1}
                value={validityDays}
                onChange={(e) => setValidityDays(Number(e.target.value))}
                className="w-full px-3 py-2 bg-surface text-xs rounded-lg border border-border font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Meals per day</label>
              <input
                type="number"
                required
                min={1}
                value={mealsPerDay}
                onChange={(e) => setMealsPerDay(Number(e.target.value))}
                className="w-full px-3 py-2 bg-surface text-xs rounded-lg border border-border font-mono"
              />
            </div>
          </div>

          {editingPlan && (
            <div>
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded border-border text-accent focus:ring-accent"
                />
                <span className="font-medium text-text">Plan is active and available for sale</span>
              </label>
            </div>
          )}

          <div className="pt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-3.5 py-2 rounded-lg border border-border text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-semibold disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save plan'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
