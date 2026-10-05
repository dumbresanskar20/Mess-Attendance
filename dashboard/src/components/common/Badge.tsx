import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'accent' | 'neutral';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  className = '',
}) => {
  const variantStyles = {
    success: 'bg-success-subtle text-success border-success-border',
    warning: 'bg-warning-subtle text-warning border-warning-border',
    danger: 'bg-danger-subtle text-danger border-danger-border',
    accent: 'bg-accent-subtle text-accent border-accent/30',
    neutral: 'bg-surface-subtle text-text-muted border-border',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
};
