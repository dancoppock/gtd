import type { Column, RepositionTicketInput, Ticket } from "@gtd/contracts";
import { arrayMove } from "@dnd-kit/sortable";

function getColumnIds(columns: Column[]) {
  return new Set(columns.map((column) => column.id));
}

function getColumnStatus(columns: Column[], columnId: string) {
  return columns.find((column) => column.id === columnId)?.statusKey ?? null;
}

function cloneGroups(columns: Column[], tickets: Ticket[]) {
  const groups = new Map<string, Ticket[]>();

  columns.forEach((column) => {
    groups.set(
      column.statusKey,
      tickets.filter((ticket) => ticket.statusKey === column.statusKey),
    );
  });

  return groups;
}

function flattenGroups(columns: Column[], groups: Map<string, Ticket[]>) {
  return columns.flatMap((column) => groups.get(column.statusKey) ?? []);
}

export function haveSameTicketLayout(previousTickets: Ticket[], nextTickets: Ticket[]) {
  return (
    previousTickets.length === nextTickets.length &&
    previousTickets.every((ticket, index) => {
      const nextTicket = nextTickets[index];

      return nextTicket
        ? ticket.id === nextTicket.id && ticket.statusKey === nextTicket.statusKey
        : false;
    })
  );
}

export function findStatusKey(columns: Column[], tickets: Ticket[], itemId: string | null) {
  if (!itemId) {
    return null;
  }

  const columnIds = getColumnIds(columns);
  if (columnIds.has(itemId)) {
    return getColumnStatus(columns, itemId);
  }

  return tickets.find((ticket) => ticket.id === itemId)?.statusKey ?? null;
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

  const activeStatusKey = activeTicket.statusKey;
  const overStatusKey = findStatusKey(columns, tickets, overId);
  if (!overStatusKey) {
    return tickets;
  }

  const sourceTickets = [...(groups.get(activeStatusKey) ?? [])];
  const destinationTickets =
    activeStatusKey === overStatusKey
      ? sourceTickets
      : [...(groups.get(overStatusKey) ?? [])];

  const activeIndex = sourceTickets.findIndex((ticket) => ticket.id === activeId);
  if (activeIndex < 0) {
    return tickets;
  }

  if (activeStatusKey === overStatusKey) {
    if (columnIds.has(overId)) {
      const nextTickets = sourceTickets.filter((ticket) => ticket.id !== activeId);
      nextTickets.push({
        ...activeTicket,
        statusKey: overStatusKey,
      });

      groups.set(overStatusKey, nextTickets);
      return flattenGroups(columns, groups);
    }

    const overIndex = sourceTickets.findIndex((ticket) => ticket.id === overId);
    if (overIndex < 0 || overIndex === activeIndex) {
      return tickets;
    }

    groups.set(overStatusKey, arrayMove(sourceTickets, activeIndex, overIndex));
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
    statusKey: overStatusKey,
  });

  groups.set(activeStatusKey, nextSourceTickets);
  groups.set(overStatusKey, nextDestinationTickets);

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

  const columnTickets = columns.flatMap((column) =>
    column.statusKey === ticket.statusKey
      ? tickets.filter((candidate) => candidate.statusKey === column.statusKey)
      : [],
  );

  const ticketIndex = columnTickets.findIndex((candidate) => candidate.id === ticketId);
  if (ticketIndex < 0) {
    return null;
  }

  return {
    statusKey: ticket.statusKey,
    prevVisibleTicketId: columnTickets[ticketIndex - 1]?.id ?? null,
    nextVisibleTicketId: columnTickets[ticketIndex + 1]?.id ?? null,
  };
}
