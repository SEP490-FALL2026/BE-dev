export type CatalogApplicationStatus = 'ACTIVE' | 'INACTIVE' | 'UNDER_REVIEW';

/** Shape the repository returns. Still database-facing: `createdAt` is a Date. */
export interface CatalogApplicationRecord {
  id: string;
  slug: string;
  name: string;
  vendor: string;
  status: CatalogApplicationStatus;
  createdAt: Date;
}

/** Shape that goes on the wire. Only types that survive JSON and OpenAPI. */
export interface CatalogApplicationWire {
  id: string;
  slug: string;
  name: string;
  vendor: string;
  status: CatalogApplicationStatus;
  createdAt: string;
}

export interface CatalogApplicationPage {
  items: CatalogApplicationWire[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}
