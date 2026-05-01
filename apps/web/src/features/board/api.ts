import type {
  ArchiveDoneTicketsResponse,
  CreateTicketInput,
  Label,
  ListTicketsResponse,
  ListLabelsResponse,
  RepositionTicketInput,
  Ticket,
  UpdateLabelInput,
  UpdateTicketInput,
} from "@gtd/contracts";

function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    return response.json().catch(() => null).then((body) => {
      const message =
        typeof body === "object" && body && "message" in body && typeof body.message === "string"
          ? body.message
          : `Request failed with status ${response.status}`;
      throw new Error(message);
    });
  }

  return response.json() as Promise<T>;
}

export type BoardFilterState = {
  priorities: string[];
  labels: string[];
  q: string;
};

export async function fetchBoardTickets(boardSlug: string, filters: BoardFilterState) {
  const params = new URLSearchParams();

  filters.priorities.forEach((priority) => params.append("priority", priority));
  filters.labels.forEach((label) => params.append("label", label));

  if (filters.q) {
    params.set("q", filters.q);
  }

  const query = params.toString();
  const url = query
    ? `/api/boards/slug/${encodeURIComponent(boardSlug)}/tickets?${query}`
    : `/api/boards/slug/${encodeURIComponent(boardSlug)}/tickets`;

  return fetch(url).then((response) => readJson<ListTicketsResponse>(response));
}

export async function fetchBoardLabels(boardSlug: string) {
  return fetch(`/api/boards/slug/${encodeURIComponent(boardSlug)}/labels`).then((response) =>
    readJson<ListLabelsResponse>(response),
  );
}

export async function createTicket(boardId: string, input: CreateTicketInput) {
  return fetch(`/api/boards/${encodeURIComponent(boardId)}/tickets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  }).then((response) => readJson<Ticket>(response));
}

export async function updateTicket(ticketId: string, input: UpdateTicketInput) {
  return fetch(`/api/tickets/${encodeURIComponent(ticketId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  }).then((response) => readJson<Ticket>(response));
}

export async function deleteTicket(ticketId: string) {
  const response = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    await readJson(response);
  }
}

export async function archiveDoneTickets(boardId: string) {
  return fetch(`/api/boards/${encodeURIComponent(boardId)}/archive-done`, {
    method: "POST",
  }).then((response) => readJson<ArchiveDoneTicketsResponse>(response));
}

export async function updateLabel(labelId: string, input: UpdateLabelInput) {
  return fetch(`/api/labels/${encodeURIComponent(labelId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  }).then((response) => readJson<Label>(response));
}

export async function deleteLabel(labelId: string) {
  const response = await fetch(`/api/labels/${encodeURIComponent(labelId)}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    await readJson(response);
  }
}

export async function repositionTicket(ticketId: string, input: RepositionTicketInput) {
  return fetch(`/api/tickets/${encodeURIComponent(ticketId)}/reposition`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  }).then((response) => readJson<Ticket>(response));
}
