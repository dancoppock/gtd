import type {
  Board,
  Column,
  Label,
  Status,
  Ticket,
  TicketPriority,
  TicketStatus,
} from "@gtd/contracts";
import {
  SYSTEM_BOARD_DESCRIPTION as SYSTEM_BOARD_DESCRIPTION_VALUE,
  SYSTEM_BOARD_NAME as SYSTEM_BOARD_NAME_VALUE,
} from "@gtd/contracts";

export type SeedTicketRecord = Omit<Ticket, "labels"> & {
  labelIds: string[];
};

export type SeedData = {
  boards: Board[];
  statuses: Status[];
  columns: Column[];
  labels: Label[];
  boardLabelFilters: Array<{
    boardId: string;
    labelId: string;
  }>;
  tickets: SeedTicketRecord[];
};

function makeTicket(args: {
  id: string;
  statusKey: TicketStatus;
  title: string;
  description: string;
  priority: TicketPriority;
  uiOrder: number;
  labelIds: string[];
}): SeedTicketRecord {
  const timestamp = new Date().toISOString();

  return {
    ...args,
    completedAt: args.statusKey === "done" ? timestamp : null,
    archivedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createSeedData(): SeedData {
  const now = new Date().toISOString();
  const boardId = "board_default";

  const boards: Board[] = [
    {
      id: boardId,
      slug: "default",
      name: SYSTEM_BOARD_NAME_VALUE,
      description: SYSTEM_BOARD_DESCRIPTION_VALUE,
      isDefault: true,
      isSystem: true,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const statuses: Status[] = [
    {
      key: "todo",
      name: "Todo",
      category: "active",
      isSystem: true,
    },
    {
      key: "in_progress",
      name: "In Progress",
      category: "active",
      isSystem: true,
    },
    {
      key: "done",
      name: "Done",
      category: "completed",
      isSystem: true,
    },
  ];

  const columns: Column[] = [
    {
      id: "col_todo",
      boardId,
      statusKey: "todo",
      statusName: "Todo",
      statusCategory: "active",
      name: "Active",
      position: 0,
    },
    {
      id: "col_done",
      boardId,
      statusKey: "done",
      statusName: "Done",
      statusCategory: "completed",
      name: "Done",
      position: 1,
    },
  ];

  const labels: Label[] = [
    {
      id: "label_product",
      name: "product",
      normalizedName: "product",
    },
    {
      id: "label_frontend",
      name: "frontend",
      normalizedName: "frontend",
    },
    {
      id: "label_backend",
      name: "backend",
      normalizedName: "backend",
    },
  ];

  const tickets: SeedTicketRecord[] = [
    makeTicket({
      id: "ticket_1",
      statusKey: "todo",
      title: "Design ticket modal",
      description: "Sketch the create and edit ticket flow using the shared schema.",
      priority: "high",
      uiOrder: 1_000_000,
      labelIds: ["label_product", "label_frontend"],
    }),
    makeTicket({
      id: "ticket_2",
      statusKey: "in_progress",
      title: "Build board API route",
      description: "Return board detail, filters, and ticket collections in one response.",
      priority: "highest",
      uiOrder: 2_000_000,
      labelIds: ["label_backend"],
    }),
    makeTicket({
      id: "ticket_3",
      statusKey: "done",
      title: "Seed default board",
      description: "Pre-create one board with Todo, In Progress, and Done columns.",
      priority: "medium",
      uiOrder: 3_000_000,
      labelIds: ["label_backend", "label_product"],
    }),
  ];

  return {
    boards,
    statuses,
    columns,
    labels,
    boardLabelFilters: [],
    tickets,
  };
}
