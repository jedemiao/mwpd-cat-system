type BadgeVariant = "success" | "danger" | "warning" | "secondary" | "info";

const variantClass: Record<BadgeVariant, string> = {
  success: "badge-success",
  danger: "badge-danger",
  warning: "badge-warning",
  secondary: "badge-secondary",
  info: "badge-info",
};

export function Badge({ variant, children }: { variant: BadgeVariant; children: React.ReactNode }) {
  return <span className={variantClass[variant]}>{children}</span>;
}
