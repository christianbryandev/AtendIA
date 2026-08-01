import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

type ButtonBaseProps = {
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  className?: string;
};

type ButtonAsButtonProps = ButtonBaseProps & {
  onClick?: () => void;
  type?: 'button' | 'submit';
  to?: never;
  href?: never;
};

type ButtonAsInternalLinkProps = ButtonBaseProps & {
  to: string;
  href?: never;
  onClick?: never;
  type?: never;
};

type ButtonAsExternalLinkProps = ButtonBaseProps & {
  href: string;
  to?: never;
  onClick?: never;
  type?: never;
};

type ButtonProps =
  | ButtonAsButtonProps
  | ButtonAsInternalLinkProps
  | ButtonAsExternalLinkProps;

const BASE =
  'inline-flex items-center justify-center rounded-lg px-6 py-3 text-[15px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700';

// brand-700 e nao brand-500: texto branco sobre o verde da logo tem
// contraste 2,6:1, abaixo do minimo WCAG AA de 4,5:1.
const VARIANTS = {
  primary: 'bg-brand-700 text-white hover:bg-brand-900',
  secondary: 'bg-white text-ink-800 border border-stone-300 hover:bg-stone-50',
} as const;

export default function Button(props: ButtonProps) {
  const { children, variant = 'primary', className = '' } = props;
  const classes = `${BASE} ${VARIANTS[variant]} ${className}`.trim();

  if (props.to) {
    return <Link to={props.to} className={classes}>{children}</Link>;
  }
  if (props.href) {
    return <a href={props.href} className={classes}>{children}</a>;
  }
  const { onClick, type = 'button' } = props;
  return (
    <button type={type} onClick={onClick} className={classes}>
      {children}
    </button>
  );
}
