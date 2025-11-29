import type { FC, ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

const PageHeader: FC<PageHeaderProps> = ({ title, description, children }) => {
  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-5">
      <div className="grid gap-1">
        <h1 className="font-bold text-3xl md:text-4xl text-foreground">
          {title}
        </h1>
        {description && (
          <p className="text-base md:text-lg text-muted-foreground">{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-3">{children}</div>}
    </div>
  );
};

export default PageHeader;
