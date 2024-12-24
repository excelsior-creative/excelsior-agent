import {
    elizaLogger,
    IAgentRuntime,
    Memory,
    Provider,
    State,
} from "@elizaos/core";
import axios from "axios";
import { FreshDeskTicket } from "../types/FreshDeskTicket";

// Types and Interfaces
interface FreshDeskAgent {
    id: number;
    contact: {
        name: string;
        email: string;
    };
}

interface FreshDeskContact {
    id: number;
    name: string;
    email: string;
    company_id?: number;
    phone?: string;
    mobile?: string;
    address?: string;
}

interface FreshDeskCompany {
    id: number;
    name: string;
    description?: string;
    domains?: string[];
    custom_fields?: Record<string, any>;
}

export enum EnumFreshdeskTicketStatus {
    Open = 2,
    Pending = 3,
    Resolved = 4,
    Closed = 5,
    WaitingOnCustomer = 6,
    WaitingOnDevTeam = 8,
}

// Constants
const TICKET_KEYWORDS = [
    "tickets",
    "support tickets",
    "open tickets",
    "pending tickets",
    "unresolved tickets",
    "customer support",
    "help desk",
    "freshdesk",
] as const;

// API Functions
const getAgents = async (runtime: IAgentRuntime): Promise<FreshDeskAgent[]> => {
    try {
        const apiEndpoint = runtime.getSetting("FRESHDESK_API_URL");
        const apiKey = runtime.getSetting("FRESHDESK_API_KEY");
        const response = await axios.get(`${apiEndpoint}/agents`, {
            headers: {
                "Content-Type": "application/json",
            },
            auth: {
                username: apiKey,
                password: "x",
            },
        });

        return response.data as FreshDeskAgent[];
    } catch (error) {
        console.error("Error fetching agents:", error);
        return [];
    }
};

const getContact = async (
    contactId: number,
    runtime: IAgentRuntime
): Promise<FreshDeskContact | null> => {
    try {
        const apiEndpoint = runtime.getSetting("FRESHDESK_API_URL");
        const apiKey = runtime.getSetting("FRESHDESK_API_KEY");
        const response = await axios.get(
            `${apiEndpoint}/contacts/${contactId}`,
            {
                headers: {
                    "Content-Type": "application/json",
                },
                auth: {
                    username: apiKey,
                    password: "x",
                },
            }
        );

        return response.data as FreshDeskContact;
    } catch (error) {
        console.error(`Error fetching contact ${contactId}:`, error);
        return null;
    }
};

const getCompany = async (
    companyId: number,
    runtime: IAgentRuntime
): Promise<FreshDeskCompany | null> => {
    try {
        const apiEndpoint = runtime.getSetting("FRESHDESK_API_URL");
        const apiKey = runtime.getSetting("FRESHDESK_API_KEY");
        const response = await axios.get(
            `${apiEndpoint}/companies/${companyId}`,
            {
                headers: {
                    "Content-Type": "application/json",
                },
                auth: {
                    username: apiKey,
                    password: "x",
                },
            }
        );

        return response.data as FreshDeskCompany;
    } catch (error) {
        console.error(`Error fetching company ${companyId}:`, error);
        return null;
    }
};

// Helper functions
const containsTicketKeyword = (text: string): boolean => {
    return TICKET_KEYWORDS.some((keyword) =>
        text.toLowerCase().includes(keyword.toLowerCase())
    );
};

const extractTicketId = (text: string): number | null => {
    // Look for patterns like "ticket #123", "#123", "ticket 123"
    const patterns = [
        /ticket #(\d+)/i,
        /#(\d+)/i,
        /ticket (\d+)/i,
        /ticket id (\d+)/i,
        /ticket number (\d+)/i,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            return parseInt(match[1], 10);
        }
    }
    return null;
};

// Link generation helper functions
const generateTicketLink = (baseUrl: string, ticketId: number): string => {
    return `${baseUrl}/a/tickets/${ticketId}`;
};

const generateContactLink = (baseUrl: string, contactId: number): string => {
    return `${baseUrl}/a/contacts/${contactId}`;
};

const generateCompanyLink = (baseUrl: string, companyId: number): string => {
    return `${baseUrl}/a/companies/${companyId}`;
};

const extractEntityId = (
    text: string
): { type: "ticket" | "contact" | "company" | null; id: number | null } => {
    // Look for patterns like "ticket #123", "#123", "ticket 123", "contact 123", "company 123"
    const patterns = {
        ticket: [
            /ticket #(\d+)/i,
            /#(\d+)/i,
            /ticket (\d+)/i,
            /ticket id (\d+)/i,
            /ticket number (\d+)/i,
        ],
        contact: [/contact #(\d+)/i, /contact (\d+)/i, /contact id (\d+)/i],
        company: [/company #(\d+)/i, /company (\d+)/i, /company id (\d+)/i],
    };

    for (const [type, typePatterns] of Object.entries(patterns)) {
        for (const pattern of typePatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                return {
                    type: type as "ticket" | "contact" | "company",
                    id: parseInt(match[1], 10),
                };
            }
        }
    }
    return { type: null, id: null };
};

const formatTicketsResponse = async (
    tickets: FreshDeskTicket[],
    runtime: IAgentRuntime
): Promise<string> => {
    if (!tickets.length) {
        return "No unresolved tickets found.";
    }

    const baseUrl = runtime.getSetting("FRESHDESK_BASE_URL");
    const agents = await getAgents(runtime);
    const agentMap = new Map(
        agents.map((agent) => [agent.id, agent.contact.name])
    );

    let response = "🎫 Current Unresolved Tickets\n\n";

    tickets.forEach((ticket) => {
        const assignedAgent = ticket.responder_id
            ? agentMap.get(ticket.responder_id) ||
              `Agent ${ticket.responder_id}`
            : "Unassigned";
        const ticketLink = generateTicketLink(baseUrl, ticket.id);
        response += `[Ticket #${ticket.id}](${ticketLink}): ${ticket.subject}\n`;
        response += `• Status: ${EnumFreshdeskTicketStatus[ticket.status]}\n`;
        response += `• Priority: ${ticket.priority}\n`;
        response += `• Assigned To: ${assignedAgent}\n`;
        response += `• Created: ${new Date(ticket.created_at).toLocaleString()}\n`;
        response += `• Updated: ${new Date(ticket.updated_at).toLocaleString()}\n\n`;
    });

    return response.trim();
};

const formatSingleTicketResponse = async (
    ticket: FreshDeskTicket,
    runtime: IAgentRuntime
): Promise<string> => {
    const baseUrl = runtime.getSetting("FRESHDESK_BASE_URL");
    const agents = await getAgents(runtime);
    const agentMap = new Map(
        agents.map((agent) => [agent.id, agent.contact.name])
    );

    const assignedAgent = ticket.responder_id
        ? agentMap.get(ticket.responder_id) || `Agent ${ticket.responder_id}`
        : "Unassigned";

    // Fetch contact and company information
    const contact = ticket.requester_id
        ? await getContact(ticket.requester_id, runtime)
        : null;
    const company = contact?.company_id
        ? await getCompany(contact.company_id, runtime)
        : null;

    const ticketLink = generateTicketLink(baseUrl, ticket.id);
    let response = `🎫 Detailed Ticket Information\n\n`;
    response += `[Ticket #${ticket.id}](${ticketLink}): ${ticket.subject}\n`;
    response += `• Status: ${EnumFreshdeskTicketStatus[ticket.status]}\n`;
    response += `• Priority: ${ticket.priority}\n`;
    response += `• Assigned To: ${assignedAgent}\n`;

    // Add requester information
    if (contact) {
        const contactLink = generateContactLink(baseUrl, contact.id);
        response += `• Requester: [${contact.name}](${contactLink})\n`;
        response += `  - Email: ${contact.email}\n`;
        if (contact.phone) response += `  - Phone: ${contact.phone}\n`;
        if (contact.mobile) response += `  - Mobile: ${contact.mobile}\n`;
    }

    // Add company information
    if (company) {
        const companyLink = generateCompanyLink(baseUrl, company.id);
        response += `• Company: [${company.name}](${companyLink})\n`;
        if (company.description)
            response += `  - Description: ${company.description}\n`;
    }

    response += `• Created: ${new Date(ticket.created_at).toLocaleString()}\n`;
    response += `• Updated: ${new Date(ticket.updated_at).toLocaleString()}\n`;
    response += `• Description:\n${ticket.description_text || "No description provided."}\n\n`;

    if (ticket.tags && ticket.tags.length > 0) {
        response += `• Tags: ${ticket.tags.join(", ")}\n`;
    }

    if (ticket.custom_fields) {
        response += `• Custom Fields:\n`;
        Object.entries(ticket.custom_fields).forEach(([key, value]) => {
            if (value) {
                response += `  - ${key}: ${value}\n`;
            }
        });
    }

    response += `\nView ticket: ${ticketLink}`;

    return response.trim();
};

export const ticketsProvider: Provider = {
    get: async (runtime: IAgentRuntime, message: Memory, _state?: State) => {
        const apiKey = runtime.getSetting("FRESHDESK_API_KEY");
        const baseUrl = runtime.getSetting("FRESHDESK_BASE_URL");

        if (!apiKey || !baseUrl) {
            elizaLogger.error(
                "FRESHDESK_API_KEY or FRESHDESK_BASE_URL not found in runtime settings"
            );
            return null;
        }

        const messageText = message.content.text;
        const entity = extractEntityId(messageText);

        // Check if user is asking for a link
        const isAskingForLink =
            messageText.toLowerCase().includes("link") ||
            messageText.toLowerCase().includes("url") ||
            messageText.toLowerCase().includes("open");

        if (isAskingForLink && entity.type && entity.id) {
            switch (entity.type) {
                case "ticket":
                    return `Here's the link to the ticket: ${generateTicketLink(baseUrl, entity.id)}`;
                case "contact":
                    return `Here's the link to the contact: ${generateContactLink(baseUrl, entity.id)}`;
                case "company":
                    return `Here's the link to the company: ${generateCompanyLink(baseUrl, entity.id)}`;
            }
        }

        if (!containsTicketKeyword(messageText)) {
            return null;
        }

        elizaLogger.info("TICKETS provider activated");

        // Check if the message contains a specific ticket ID
        const ticketId = extractTicketId(messageText);

        if (ticketId) {
            try {
                const ticket = await getTicket(ticketId, runtime, [
                    "description",
                ]);
                return formatSingleTicketResponse(ticket, runtime);
            } catch (error) {
                elizaLogger.error(`Error fetching ticket ${ticketId}:`, error);
                return `Unable to find ticket #${ticketId}. Please verify the ticket number and try again.`;
            }
        }

        // If no specific ticket ID, return all unresolved tickets
        const tickets = await getUnresolvedTickets(runtime);
        return formatTicketsResponse(tickets, runtime);
    },
};

// get freshdesk unresolved tickets
export const getUnresolvedTickets = async (
    runtime: IAgentRuntime
): Promise<FreshDeskTicket[]> => {
    try {
        const apiEndpoint = runtime.getSetting("FRESHDESK_API_URL");
        const apiKey = runtime.getSetting("FRESHDESK_API_KEY");
        const response = await axios.get(
            `${apiEndpoint}/search/tickets?query="status:2 OR status:3 OR status:6 OR status:8"`,
            {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
                auth: {
                    username: apiKey,
                    password: "x",
                },
            }
        );

        return response.data.results as FreshDeskTicket[];
    } catch (error) {
        console.error("Error fetching unresolved tickets:", error);
        throw error;
    }
};

/**
 * Fetches a FreshDesk ticket by its ID.
 * @param {number} ticketId - The ID of the ticket.
 * @returns {Promise<FreshDeskTicket>} - The FreshDesk ticket.
 * @throws Will throw an error if the ticket cannot be retrieved.
 */
export const getTicket = async (
    ticketId: number,
    runtime: IAgentRuntime,
    include?: string[]
): Promise<FreshDeskTicket> => {
    try {
        const apiEndpoint = runtime.getSetting("FRESHDESK_API_URL");
        const apiKey = runtime.getSetting("FRESHDESK_API_KEY");

        let url = `${apiEndpoint}/tickets/${ticketId}`;

        // Add include parameters if specified
        if (include && include.length > 0) {
            url += `?include=${include.join(",")}`;
        }

        const response = await axios.get(url, {
            headers: {
                "Content-Type": "application/json",
            },
            auth: {
                username: apiKey,
                password: "x",
            },
        });

        return response.data as FreshDeskTicket;
    } catch (error) {
        console.error(`Error fetching ticket ${ticketId}:`, error);
        throw error;
    }
};
