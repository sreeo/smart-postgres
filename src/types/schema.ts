export interface Column {
  name: string;
  type: string;
  nullable: boolean;
  description?: string;
  default?: string;
  isPrimary: boolean;
}

export interface ForeignKey {
  column: string;
  referencedTable: string;
  referencedColumn: string;
  onDelete: string;
  onUpdate: string;
}

export interface Index {
  name: string;
  isUnique: boolean;
  definition: string;
}

export interface Constraint {
  name: string;
  type: string;
  definition: string;
}

export interface TableStatistics {
  totalRows: number;
  sizeInBytes: number;
  lastVacuum?: string;
  lastAutoVacuum?: string;
}

export interface Table {
  name: string;
  columns: Column[];
  foreignKeys?: ForeignKey[];
  indexes?: Index[];
  constraints?: Constraint[];
  statistics?: TableStatistics;
}

export interface DatabaseSchema {
  tables: Table[];
} 