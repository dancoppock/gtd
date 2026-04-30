import type { Column, RepositionTicketInput, Ticket } from "@gtd/contracts";
import { arrayMove } from "@dnd-kit/sortable";

function getColumnIds(columns: Column[]) {
  return new Set(columns.map((column) => column.id));
}

function cloneGroups(columns: Column[], tickets: Ticket[]) {
  const groups = new Map<string, Ticket[]>();

  columns.forEach((column) => {
    groups.set(column.id, tickets.filter((ticket) => ticket.columnId === column.id));
  });

  return groups;
}

function flattenGroups(columns: Column[], groups: Map<string, Ticket[]>) {
  return columns.flatMap((column) => groups.get(column.id) ?? []);
}

export function haveSameTicketLayout(previousTickets: Ticket[], nextTickets: Ticket[]) {
  return (
    previousTickets.length === nextTickets.length &&
    previousTickets.every((ticket, index) => {
      const nextTicket = nextTickets[index];

      return nextTicket
        ? ticket.id === nextTicket.id && ticket.columnId === nextTicket.columnId
        : false;
    })
  );
}

export function findColumnId(columns: Column[], tickets: Ticket[], itemId: string | null) {
  if (!itemId) {
    return null;
  }

  const columnIds = getColumnIds(columns);
  if (columnIds.has(itemId)) {
    return itemId;
  }

  return tickets.find((ticket) => ticket.id === itemId)?.columnId ?? null;
}

export function moveTicket(
  columns: Column[],
  tickets: Ticket[],
  activeId: string,
  overId: string,
) {
  const columnIds = getColumnIds(columns);
  const groups = cloneGroups(columns, tickets);

  const activeTicket = tickets.find((ticket) => ticket.id === activeId);
  if (!activeTicket) {
    return tickets;
  }

  const activeColumnId = activeTicket.columnId;
  const overColumnId = findColumnId(columns, tickets, overId);
  if (!overColumnId) {
    return tickets;
  }

  const sourceTickets = [...(groups.get(activeColumnId) ?? [])];
  const destinationTickets =
    activeColumnId === overColumnId
      ? sourceTickets
      : [...(groups.get(overColumnId) ?? [])];

  const activeIndex = sourceTickets.findIndex((ticket) => ticket.id === activeId);
  if (activeIndex < 0) {
    return tickets;
  }

  if (activeColumnId === overColumnId) {
    if (columnIds.has(overId)) {
      const nextTickets = sourceTickets.filter((ticket) => ticket.id !== activeId);
      nextTickets.push({
        ...activeTicket,
        columnId: overColumnId,
      });

      groups.set(overColumnId, nextTickets);
      return flattenGroups(columns, groups);
    }

    const overIndex = sourceTickets.findIndex((ticket) => ticket.id === overId);
    if (overIndex < 0 || overIndex === activeIndex) {
      return tickets;
    }

    groups.set(overColumnId, arrayMove(sourceTickets, activeIndex, overIndex));
    return flattenGroups(columns, groups);
  }

  const nextSourceTickets = sourceTickets.filter((ticket) => ticket.id !== activeId);
  const nextDestinationTickets = [...destinationTickets];
  const overIndex = columnIds.has(overId)
    ? nextDestinationTickets.length
    : nextDestinationTickets.findIndex((ticket) => ticket.id === overId);
  const insertIndex = overIndex < 0 ? nextDestinationTickets.length : overIndex;

  nextDestinationTickets.splice(insertIndex, 0, {
    ...activeTicket,
    columnId: overColumnId,
  });

  groups.set(activeColumnId, nextSourceTickets);
  groups.set(overColumnId, nextDestinationTickets);

  return flattenGroups(columns, groups);
}

export function buildRepositionInput(
  columns: Column[],
  tickets: Ticket[],
  ticketId: string,
): RepositionTicketInput | null {
  const ticket = tickets.find((candidate) => candidate.id === ticketId);
  if (!ticket) {
    return null;
  }

  const columnTickets = columns
    .flatMap((column) => (column.id === ticket.columnId ? tickets.filter((candidate) => candidate.columnId === column.id) : []));

  const ticketIndex = columnTickets.findIndex((candidate) => candidate.id === ticketId);
  if (ticketIndex < 0) {
    return null;
  }

  return {
    columnId: ticket.columnId,
    prevVisibleTicketId: columnTickets[ticketIndex - 1]?.id ?? null,
    nextVisibleTicketId: columnTickets[ticketIndex + 1]?.id ?? null,
  };
}
