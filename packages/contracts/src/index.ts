import { z } from "zod";

export const SYSTEM_BOARD_NAME = "System Board";
export const SYSTEM_BOARD_DESCRIPTION = "System Board";
export const SYSTEM_BOARD_ACTIVE_STATUS_KEY = "__system_active__";
export const SYSTEM_BOARD_DONE_STATUS_KEY = "__system_done__";

export const ticketPrioritySchema = z.enum(["highest", "high", "medium", "low"]);
export const statusCategorySchema = z.enum(["active", "completed"]);
export const ticketStatusSchema = z.string().trim().min(1).max(80);

export const statusSchema = z.object({
  key: ticketStatusSchema,
  name: z.string().min(1),
  category: statusCategorySchema,
  isSystem: z.boolean(),
});

export const labelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  normalizedName: z.string().min(1),
});

export const labelUsageSchema = labelSchema.extend({
  activeTicketCount: z.number().int().nonnegative(),
  archivedTicketCount: z.number().int().nonnegative(),
});

export const boardSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  isDefault: z.boolean(),
  isPinned: z.boolean(),
  showPriorityColors: z.boolean(),
  isSystem: z.boolean(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const columnSchema = z.object({
  id: z.string().min(1),
  boardId: z.string().min(1),
  name: z.string().min(1),
  statusKey: ticketStatusSchema,
  statusName: z.string().min(1),
  statusCategory: statusCategorySchema,
  position: z.number().int().nonnegative(),
});

export const ticketSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  priority: ticketPrioritySchema,
  statusKey: ticketStatusSchema,
  uiOrder: z.number().int(),
  labels: z.array(labelSchema),
  completedAt: z.string().nullable(),
  archivedAt: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const boardFiltersSchema = z.object({
  priorities: z.array(ticketPrioritySchema).default([]),
  labels: z.array(z.string().min(1)).default([]),
  q: z.string().default(""),
});

export const boardDetailSchema = boardSchema.extend({
  columns: z.array(columnSchema),
  availableLabels: z.array(labelSchema),
  availableStatuses: z.array(statusSchema),
  filterLabels: z.array(labelSchema),
});

export const listTicketsResponseSchema = z.object({
  board: boardDetailSchema,
  filters: boardFiltersSchema,
  tickets: z.array(ticketSchema),
});

export const listLabelsResponseSchema = z.object({
  labels: z.array(labelUsageSchema),
});

export const listStatusesResponseSchema = z.object({
  statuses: z.array(statusSchema),
});

export const insightsSummarySchema = z.object({
  doneToday: z.number().int().nonnegative(),
  doneThisWeek: z.number().int().nonnegative(),
  doneLastWeek: z.number().int().nonnegative(),
});

export const insightsResponseSchema = z.object({
  summary: insightsSummarySchema,
  tickets: z.object({
    doneToday: z.array(ticketSchema),
    doneThisWeek: z.array(ticketSchema),
  }),
});

export const createStatusInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

export const boardColumnInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  statusKey: ticketStatusSchema,
  statusName: z.string().trim().min(1).max(60).optional(),
});

export const createBoardInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2_000).default(""),
  isDefault: z.boolean().default(false),
  isPinned: z.boolean().default(false),
  showPriorityColors: z.boolean().default(true),
  columns: z.array(boardColumnInputSchema).min(1),
  filterLabelIds: z.array(z.string().min(1)).default([]),
});

export const updateBoardInputSchema = createBoardInputSchema;

export const createTicketInputSchema = z.object({
  statusKey: ticketStatusSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().default(""),
  priority: ticketPrioritySchema.default("medium"),
  labels: z.array(z.string().min(1)).default([]),
  position: z.enum(["top", "bottom"]).optional(),
});

export const updateTicketInputSchema = z.object({
  statusKey: ticketStatusSchema.optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().optional(),
  priority: ticketPrioritySchema.optional(),
  labels: z.array(z.string().min(1)).optional(),
});

export const updateLabelInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const repositionTicketInputSchema = z.object({
  statusKey: ticketStatusSchema,
  prevVisibleTicketId: z.string().min(1).nullable(),
  nextVisibleTicketId: z.string().min(1).nullable(),
});

export const archiveDoneTicketsResponseSchema = z.object({
  archivedCount: z.number().int().nonnegative(),
});

export type TicketPriority = z.infer<typeof ticketPrioritySchema>;
export type StatusCategory = z.infer<typeof statusCategorySchema>;
export type TicketStatus = z.infer<typeof ticketStatusSchema>;
export type Status = z.infer<typeof statusSchema>;
export type Label = z.infer<typeof labelSchema>;
export type LabelUsage = z.infer<typeof labelUsageSchema>;
export type Board = z.infer<typeof boardSchema>;
export type Column = z.infer<typeof columnSchema>;
export type Ticket = z.infer<typeof ticketSchema>;
export type BoardFilters = z.infer<typeof boardFiltersSchema>;
export type BoardDetail = z.infer<typeof boardDetailSchema>;
export type ListTicketsResponse = z.infer<typeof listTicketsResponseSchema>;
export type ListLabelsResponse = z.infer<typeof listLabelsResponseSchema>;
export type ListStatusesResponse = z.infer<typeof listStatusesResponseSchema>;
export type InsightsSummary = z.infer<typeof insightsSummarySchema>;
export type InsightsResponse = z.infer<typeof insightsResponseSchema>;
export type CreateStatusInput = z.infer<typeof createStatusInputSchema>;
export type BoardColumnInput = z.infer<typeof boardColumnInputSchema>;
export type CreateBoardInput = z.infer<typeof createBoardInputSchema>;
export type UpdateBoardInput = z.infer<typeof updateBoardInputSchema>;
export type CreateTicketInput = z.infer<typeof createTicketInputSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketInputSchema>;
export type UpdateLabelInput = z.infer<typeof updateLabelInputSchema>;
export type RepositionTicketInput = z.infer<typeof repositionTicketInputSchema>;
export type ArchiveDoneTicketsResponse = z.infer<typeof archiveDoneTicketsResponseSchema>;
