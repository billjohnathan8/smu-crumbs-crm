import { describe, it, expect, vi, beforeEach } from "vitest";
import { listLogs, getLogById, createLog, listClientLogs } from "../logs";
import * as client from "../client";
import type { LogEntry, CreateLogRequest, PaginatedResponse } from "../types";

vi.mock("../client");

describe("logs API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listLogs", () => {
    it("should list logs without params", async () => {
      const mockResponse: PaginatedResponse<LogEntry> = {
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      };

      vi.spyOn(client, "apiGet").mockResolvedValue(mockResponse);

      const result = await listLogs();

      expect(client.apiGet).toHaveBeenCalledWith("/api/logs");
      expect(result).toEqual(mockResponse);
    });

    it("should list logs with limit and offset", async () => {
      vi.spyOn(client, "apiGet").mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      });

      await listLogs({ limit: 50, offset: 100 });

      expect(client.apiGet).toHaveBeenCalledWith(
        "/api/logs?limit=50&offset=100",
      );
    });

    it("should filter logs by agentId", async () => {
      vi.spyOn(client, "apiGet").mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      });

      await listLogs({ agentId: "agent-123" });

      expect(client.apiGet).toHaveBeenCalledWith("/api/logs?agentId=agent-123");
    });

    it("should filter logs by clientId", async () => {
      vi.spyOn(client, "apiGet").mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      });

      await listLogs({ clientId: "client-456" });

      expect(client.apiGet).toHaveBeenCalledWith(
        "/api/logs?clientId=client-456",
      );
    });

    it("should filter logs by action", async () => {
      vi.spyOn(client, "apiGet").mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      });

      await listLogs({ action: "CREATE" });

      expect(client.apiGet).toHaveBeenCalledWith("/api/logs?action=CREATE");
    });

    it("should list logs with all params", async () => {
      vi.spyOn(client, "apiGet").mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      });

      await listLogs({
        limit: 25,
        offset: 50,
        agentId: "agent-123",
        clientId: "client-456",
        action: "UPDATE",
      });

      const callArg = vi.mocked(client.apiGet).mock.calls[0][0];
      expect(callArg).toContain("/api/logs?");
      expect(callArg).toContain("limit=25");
      expect(callArg).toContain("offset=50");
      expect(callArg).toContain("agentId=agent-123");
      expect(callArg).toContain("clientId=client-456");
      expect(callArg).toContain("action=UPDATE");
    });
  });

  describe("getLogById", () => {
    it("should get log by ID", async () => {
      const mockLog: LogEntry = {
        logId: "log-123",
        agentId: "agent-456",
        clientId: "client-789",
        action: "UPDATE",
        attributeName: "phoneNumber",
        beforeValue: "+6512345678",
        afterValue: "+6587654321",
        dateTime: "2024-01-20T10:30:00Z",
      };

      vi.spyOn(client, "apiGet").mockResolvedValue(mockLog);

      const result = await getLogById("log-123");

      expect(client.apiGet).toHaveBeenCalledWith("/api/logs/log-123");
      expect(result).toEqual(mockLog);
    });
  });

  describe("createLog", () => {
    it("should create log entry", async () => {
      const createRequest: CreateLogRequest = {
        agentId: "agent-123",
        clientId: "client-456",
        action: "CREATE",
        attributeName: "email",
        afterValue: "new@example.com",
      };

      const mockLog: LogEntry = {
        logId: "log-new",
        agentId: "agent-123",
        clientId: "client-456",
        action: "CREATE",
        attributeName: "email",
        beforeValue: null,
        afterValue: "new@example.com",
        dateTime: "2024-01-20T12:00:00Z",
      };

      vi.spyOn(client, "apiPost").mockResolvedValue(mockLog);

      const result = await createLog(createRequest);

      expect(client.apiPost).toHaveBeenCalledWith("/api/logs", createRequest);
      expect(result).toEqual(mockLog);
    });
  });

  describe("listClientLogs", () => {
    it("should list logs for a specific client without params", async () => {
      const mockResponse: PaginatedResponse<LogEntry> = {
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      };

      vi.spyOn(client, "apiGet").mockResolvedValue(mockResponse);

      const result = await listClientLogs("client-123");

      expect(client.apiGet).toHaveBeenCalledWith(
        "/api/clients/client-123/logs",
      );
      expect(result).toEqual(mockResponse);
    });

    it("should list client logs with limit and offset", async () => {
      vi.spyOn(client, "apiGet").mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      });

      await listClientLogs("client-456", { limit: 20, offset: 40 });

      expect(client.apiGet).toHaveBeenCalledWith(
        "/api/clients/client-456/logs?limit=20&offset=40",
      );
    });
  });
});
