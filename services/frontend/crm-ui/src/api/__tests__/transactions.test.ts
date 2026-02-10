import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listTransactions,
  getTransactionById,
  createTransaction,
  deleteTransaction,
} from "../transactions";
import * as client from "../client";
import type {
  Transaction,
  CreateTransactionRequest,
  PaginatedResponse,
} from "../types";

vi.mock("../client");

describe("transactions API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listTransactions", () => {
    it("should list transactions without params", async () => {
      const mockResponse: PaginatedResponse<Transaction> = {
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      };

      vi.spyOn(client, "apiGet").mockResolvedValue(mockResponse);

      const result = await listTransactions();

      expect(client.apiGet).toHaveBeenCalledWith("/api/transactions");
      expect(result).toEqual(mockResponse);
    });

    it("should list transactions with limit and offset", async () => {
      vi.spyOn(client, "apiGet").mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      });

      await listTransactions({ limit: 25, offset: 50 });

      expect(client.apiGet).toHaveBeenCalledWith(
        "/api/transactions?limit=25&offset=50",
      );
    });

    it("should filter transactions by clientId", async () => {
      vi.spyOn(client, "apiGet").mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      });

      await listTransactions({ clientId: "client-123" });

      expect(client.apiGet).toHaveBeenCalledWith(
        "/api/transactions?clientId=client-123",
      );
    });

    it("should filter transactions by status", async () => {
      vi.spyOn(client, "apiGet").mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      });

      await listTransactions({ status: "Completed" });

      expect(client.apiGet).toHaveBeenCalledWith(
        "/api/transactions?status=Completed",
      );
    });

    it("should filter transactions by transaction kind", async () => {
      vi.spyOn(client, "apiGet").mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      });

      await listTransactions({ transaction: "D" });

      expect(client.apiGet).toHaveBeenCalledWith(
        "/api/transactions?transaction=D",
      );
    });

    it("should filter transactions by date range", async () => {
      vi.spyOn(client, "apiGet").mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      });

      await listTransactions({
        fromDate: "2024-01-01",
        toDate: "2024-01-31",
      });

      expect(client.apiGet).toHaveBeenCalledWith(
        "/api/transactions?fromDate=2024-01-01&toDate=2024-01-31",
      );
    });

    it("should list transactions with all params", async () => {
      vi.spyOn(client, "apiGet").mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      });

      await listTransactions({
        limit: 20,
        offset: 40,
        clientId: "client-123",
        status: "Pending",
        transaction: "W",
        fromDate: "2024-01-01",
        toDate: "2024-12-31",
      });

      expect(client.apiGet).toHaveBeenCalledWith(
        "/api/transactions?limit=20&offset=40&clientId=client-123&status=Pending&transaction=W&fromDate=2024-01-01&toDate=2024-12-31",
      );
    });
  });

  describe("getTransactionById", () => {
    it("should get transaction by ID", async () => {
      const mockTransaction: Transaction = {
        id: "txn-123",
        clientId: "client-456",
        transaction: "D",
        amount: 1000,
        date: "2024-01-15",
        status: "Completed",
        importedAt: "2024-01-15T10:30:00Z",
      };

      vi.spyOn(client, "apiGet").mockResolvedValue(mockTransaction);

      const result = await getTransactionById("txn-123");

      expect(client.apiGet).toHaveBeenCalledWith("/api/transactions/txn-123");
      expect(result).toEqual(mockTransaction);
    });
  });

  describe("createTransaction", () => {
    it("should create deposit transaction", async () => {
      const createRequest: CreateTransactionRequest = {
        clientId: "client-123",
        transaction: "D",
        amount: 500,
        date: "2024-01-20",
        status: "Completed",
      };

      const mockTransaction: Transaction = {
        id: "txn-new",
        clientId: "client-123",
        transaction: "D",
        amount: 500,
        date: "2024-01-20",
        status: "Completed",
        importedAt: "2024-01-20T14:00:00Z",
      };

      vi.spyOn(client, "apiPost").mockResolvedValue(mockTransaction);

      const result = await createTransaction(createRequest);

      expect(client.apiPost).toHaveBeenCalledWith(
        "/api/transactions",
        createRequest,
      );
      expect(result).toEqual(mockTransaction);
    });

    it("should create withdrawal transaction", async () => {
      const createRequest: CreateTransactionRequest = {
        clientId: "client-123",
        transaction: "W",
        amount: 200,
        date: "2024-01-20",
        status: "Pending",
      };

      const mockTransaction: Transaction = {
        id: "txn-withdrawal",
        ...createRequest,
        importedAt: "2024-01-20T15:00:00Z",
      };

      vi.spyOn(client, "apiPost").mockResolvedValue(mockTransaction);

      const result = await createTransaction(createRequest);

      expect(result.transaction).toBe("W");
    });
  });

  describe("deleteTransaction", () => {
    it("should delete transaction", async () => {
      vi.spyOn(client, "apiDelete").mockResolvedValue(undefined);

      await deleteTransaction("txn-123");

      expect(client.apiDelete).toHaveBeenCalledWith(
        "/api/transactions/txn-123",
      );
    });
  });
});
