import type {
  ArchiveDoneTicketsResponse,
  Board,
  BoardDetail,
  BoardFilters,
  CreateTicketInput,
  Label,
  LabelUsage,
  RepositionTicketInput,
  Ticket,
  UpdateLabelInput,
  UpdateTicketInput,
} from "@gtd/contracts";

import { SqliteBoardStore } from "./sqlite-board-store.js";

export type BoardStore = {
  listBoards(): Board[];
  getBoardById(boardId: string): Board | null;
  getBoardBySlug(slug: string): Board | null;
  getBoardDetail(boardId: string): BoardDetail | null;
  getLabelById(labelId: string): Label | null;
  listAllLabels(boardId: string): LabelUsage[];
  listTickets(boardId: string, filters: BoardFilters): Ticket[];
  createTicket(boardId: string, input: CreateTicketInput): Ticket | null;
  updateLabel(labelId: string, input: UpdateLabelInput): Label | null;
  deleteLabel(labelId: string): boolean;
  updateTicket(ticketId: string, input: UpdateTicketInput): Ticket | null;
  deleteTicket(ticketId: string): boolean;
  archiveDoneTickets(boardId: string): ArchiveDoneTicketsResponse | null;
  repositionTicket(ticketId: string, input: RepositionTicketInput): Ticket | null;
  dispose?(): void;
};

export function createDefaultBoardStore(): BoardStore {
  return new SqliteBoardStore();
}

export const boardStore: BoardStore = createDefaultBoardStore();
