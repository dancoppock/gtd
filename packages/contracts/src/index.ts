import { z } from "zod";

export const ticketPrioritySchema = z.enum([
  "highest",
  "high",
  "medium",
  "low",
]);

export type TicketPriority = z.infer<typeof ticketPrioritySchema>;

export const columnKeySchema = z.enum([
  "todo",
  "in_progress",
  "done",
]);

export type ColumnKey = z.infer<typeof columnKeySchema>;

export const boardSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Board = z.infer<typeof boardSchema>;

export const columnSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  key: columnKeySchema,
  name: z.string(),
  position: z.number().int().nonnegative(),
});

export type Column = z.infer<typeof columnSchema>;

export const labelSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  name: z.string(),
  normalizedName: z.string(),
});

export type Label = z.infer<typeof labelSchema>;

export const ticketSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  columnId: z.string(),
  title: z.string(),
  description: z.string(),
  priority: ticketPrioritySchema.default("medium"),
  uiOrder: z.number().int(),
  labels: z.array(labelSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Ticket = z.infer<typeof ticketSchema>;

export const boardDetailSchema = boardSchema.extend({
  columns: z.array(columnSchema),
  labels: z.array(labelSchema),
});

export type BoardDetail = z.infer<typeof boardDetailSchema>;

export const boardFiltersSchema = z.object({
  priorities: z.array(ticketPrioritySchema).default([]),
  labels: z.array(z.string().min(1)).default([]),
  q: z.string().trim().default(""),
});

export type BoardFilters = z.infer<typeof boardFiltersSchema>;

export const createTicketInputSchema = z.object({
  columnId: z.string(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().default(""),
  priority: ticketPrioritySchema.default("medium"),
  labels: z.array(z.string().trim().min(1).max(50)).default([]),
});

export type CreateTicketInput = z.infer<typeof createTicketInputSchema>;

export const updateTicketInputSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().optional(),
  columnId: z.string().optional(),
  priority: ticketPrioritySchema.optional(),
  labels: z.array(z.string().trim().min(1).max(50)).optional(),
});

export type UpdateTicketInput = z.infer<typeof updateTicketInputSchema>;

export const repositionTicketInputSchema = z.object({
  columnId: z.string(),
  prevVisibleTicketId: z.string().nullable(),
  nextVisibleTicketId: z.string().nullable(),
});

export type RepositionTicketInput = z.infer<typeof repositionTicketInputSchema>;

export const listTicketsResponseSchema = z.object({
  board: boardDetailSchema,
  filters: boardFiltersSchema,
  tickets: z.array(ticketSchema),
});

export type ListTicketsResponse = z.infer<typeof listTicketsResponseSchema>;
