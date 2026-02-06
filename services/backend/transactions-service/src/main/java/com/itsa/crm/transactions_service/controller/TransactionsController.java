package com.itsa.crm.transactions_service.controller;

import com.itsa.crm.transactions_service.api.Pagination;
import com.itsa.crm.transactions_service.dto.CreateTransactionRequest;
import com.itsa.crm.transactions_service.dto.ImportBatchDto;
import com.itsa.crm.transactions_service.dto.ImportTransactionsRequest;
import com.itsa.crm.transactions_service.dto.TransactionDto;
import com.itsa.crm.transactions_service.dto.TransactionKind;
import com.itsa.crm.transactions_service.dto.TransactionStatus;
import com.itsa.crm.transactions_service.dto.TransactionsListResponse;
import com.itsa.crm.transactions_service.exception.TransactionNotFoundException;
import com.itsa.crm.transactions_service.security.AuthenticatedUser;
import com.itsa.crm.transactions_service.security.ForbiddenException;
import com.itsa.crm.transactions_service.security.RequestAuth;
import com.itsa.crm.transactions_service.service.ClientAccessValidator;
import com.itsa.crm.transactions_service.service.InMemoryTransactionsStore;
import com.itsa.crm.transactions_service.service.TransactionsService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.format.annotation.DateTimeFormat.ISO;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST endpoints for transaction CRUD and import operations.
 */
@RestController
@RequestMapping("/api")
public class TransactionsController {
	private final TransactionsService transactionsService;
	private final RequestAuth requestAuth;
	private final ClientAccessValidator clientAccessValidator;

	public TransactionsController(
		TransactionsService transactionsService,
		RequestAuth requestAuth,
		ClientAccessValidator clientAccessValidator
	) {
		this.transactionsService = transactionsService;
		this.requestAuth = requestAuth;
		this.clientAccessValidator = clientAccessValidator;
	}

	@GetMapping("/transactions")
	/**
	 * Lists transactions with optional filters. Agents must supply a clientId and
	 * have access to that client; otherwise an empty page is returned.
	 */
	public TransactionsListResponse listTransactions(
		HttpServletRequest request,
		@RequestParam(defaultValue = "50") int limit,
		@RequestParam(defaultValue = "0") int offset,
		@RequestParam(required = false) String clientId,
		@RequestParam(required = false) TransactionStatus status,
		@RequestParam(required = false, name = "transaction") TransactionKind kind,
		@RequestParam(required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate fromDate,
		@RequestParam(required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate toDate
	) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		requireAnyRole(user, "admin", "agent");

		String authHeader = request.getHeader("Authorization");
		if (user.isAgent()) {
			// We can only verify ownership for a specific clientId without enumerating
			// all agent-owned clients from clients-service. For safety, return empty
			// unless a clientId is provided and authorized.
			if (clientId == null || clientId.isBlank()) {
				return new TransactionsListResponse(
					java.util.List.of(),
					new Pagination(normalizeLimit(limit), normalizeOffset(offset), 0)
				);
			}
			clientAccessValidator.requireClientAccessible(user, authHeader, clientId);
		}

		InMemoryTransactionsStore.ListResult result = transactionsService.list(
			normalizeLimit(limit),
			normalizeOffset(offset),
			clientId,
			status,
			kind,
			fromDate,
			toDate
		);
		return new TransactionsListResponse(
			result.data(),
			new Pagination(normalizeLimit(limit), normalizeOffset(offset), result.total())
		);
	}

	@PostMapping("/transactions")
	@ResponseStatus(HttpStatus.CREATED)
	/**
	 * Creates a new transaction. Admin-only.
	 */
	public TransactionDto createTransaction(
		HttpServletRequest request,
		@Valid @RequestBody CreateTransactionRequest body
	) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		requireAnyRole(user, "admin");
		return transactionsService.create(body);
	}

	@GetMapping("/transactions/{transactionId}")
	/**
	 * Fetches a transaction by id. Agents receive a 404 when access is forbidden.
	 */
	public TransactionDto getTransaction(HttpServletRequest request, @PathVariable String transactionId) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		requireAnyRole(user, "admin", "agent");

		TransactionDto tx = transactionsService.get(transactionId);
		if (user.isAgent()) {
			String authHeader = request.getHeader("Authorization");
			try {
				clientAccessValidator.requireClientAccessible(user, authHeader, tx.clientId());
			}
			catch (ForbiddenException ex) {
				throw new TransactionNotFoundException(transactionId);
			}
		}
		return tx;
	}

	@DeleteMapping("/transactions/{transactionId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	/**
	 * Deletes a transaction by id. Admin-only.
	 */
	public void deleteTransaction(HttpServletRequest request, @PathVariable String transactionId) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		requireAnyRole(user, "admin");
		transactionsService.delete(transactionId);
	}

	@GetMapping("/clients/{clientId}/transactions")
	/**
	 * Lists transactions scoped to a single client id after access validation.
	 */
	public TransactionsListResponse listTransactionsForClient(
		HttpServletRequest request,
		@PathVariable String clientId,
		@RequestParam(defaultValue = "50") int limit,
		@RequestParam(defaultValue = "0") int offset
	) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		requireAnyRole(user, "admin", "agent");
		String authHeader = request.getHeader("Authorization");
		clientAccessValidator.requireClientAccessible(user, authHeader, clientId);

		InMemoryTransactionsStore.ListResult result = transactionsService.list(
			normalizeLimit(limit),
			normalizeOffset(offset),
			clientId,
			null,
			null,
			null,
			null
		);
		return new TransactionsListResponse(
			result.data(),
			new Pagination(normalizeLimit(limit), normalizeOffset(offset), result.total())
		);
	}

	@PostMapping("/transactions/import")
	/**
	 * Starts an async-style import from the configured mock SFTP source. Admin-only.
	 */
	public ResponseEntity<ImportBatchDto> importTransactions(
		HttpServletRequest request,
		@RequestBody(required = false) ImportTransactionsRequest body
	) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		requireAnyRole(user, "admin");
		return ResponseEntity.status(HttpStatus.ACCEPTED).body(transactionsService.importFromSftp(body));
	}

	@GetMapping("/transactions/imports/{importBatchId}")
	/**
	 * Retrieves import batch status by id. Admin-only.
	 */
	public ImportBatchDto getImportBatch(HttpServletRequest request, @PathVariable String importBatchId) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		requireAnyRole(user, "admin");
		return transactionsService.getBatch(importBatchId);
	}

	private static int normalizeLimit(int limit) {
		return Math.max(1, Math.min(200, limit));
	}

	private static int normalizeOffset(int offset) {
		return Math.max(0, offset);
	}

	private static void requireAnyRole(AuthenticatedUser user, String... allowed) {
		for (String role : allowed) {
			if (role.equals(user.role())) {
				return;
			}
		}
		throw new ForbiddenException("forbidden");
	}
}
