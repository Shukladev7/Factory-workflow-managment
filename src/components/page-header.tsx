import type { FC, ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

const PageHeader: FC<PageHeaderProps> = ({ title, description, children }) => {
  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 mb-6 border-b-2 border-slate-200">
      <div className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900">
          {title}
        </h1>
        {description && (
          <p className="text-sm md:text-base font-medium text-slate-500">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-3 flex-wrap">
          {children}
        </div>
      )}
    </div>
  );
};

export default PageHeader;
