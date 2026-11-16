import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { Link, useInRouterContext } from 'react-router';

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  to: string;
  disabled?: boolean;
  onNavigate?: () => void;
};
/** Links retain native open-in-new-tab behavior; callbacks can enforce in-flight mutation guards. */
export function AppLink({ to, disabled, onNavigate, onClick, ...props }: Props) {
  const routed = useInRouterContext();
  const click = (event: MouseEvent<HTMLAnchorElement>) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
    if (
      !event.defaultPrevented &&
      onNavigate &&
      event.button === 0 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      event.preventDefault();
      onNavigate();
    }
  };
  const common = {
    ...props,
    className: `app-route-link ${props.className ?? ''}`,
    'aria-disabled': disabled || undefined,
    onClick: click,
  };
  return routed ? <Link to={to} {...common} /> : <a href={to} {...common} />;
}
