import type {
  Board,
  BoardDetail,
  BoardFilters,
  CreateTicketInput,
  RepositionTicketInput,
  Ticket,
  UpdateTicketInput,
} from "@gtd/contracts";

import { SqliteBoardStore } from "./sqlite-board-store.js";

export type BoardStore = {
  listBoards(): Board[];
  getBoardById(boardId: string): Board | null;
  getBoardBySlug(slug: string): Board | null;
  getBoardDetail(boardId: string): BoardDetail | null;
  listTickets(boardId: string, filters: BoardFilters): Ticket[];
  createTicket(boardId: string, input: CreateTicketInput): Ticket | null;
  updateTicket(ticketId: string, input: UpdateTicketInput): Ticket | null;
  repositionTicket(ticketId: string, input: RepositionTicketInput): Ticket | null;
  dispose?(): void;
};

export function createDefaultBoardStore(): BoardStore {
  return new SqliteBoardStore();
}

export const boardStore: BoardStore = createDefaultBoardStore();
