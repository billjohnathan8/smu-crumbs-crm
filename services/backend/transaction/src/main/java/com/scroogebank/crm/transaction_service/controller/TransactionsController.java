package com.scroogebank.crm.transaction_service.controller;

import com.scroogebank.crm.transaction_service.api.Pagination;
import com.scroogebank.crm.transaction_service.dto.CreateTransactionRequest;
import com.scroogebank.crm.transaction_service.dto.ImportBatchDto;
import com.scroogebank.crm.transaction_service.dto.ImportTransactionsRequest;
import com.scroogebank.crm.transaction_service.dto.TransactionDto;
import com.scroogebank.crm.transaction_service.dto.TransactionKind;
import com.scroogebank.crm.transaction_service.dto.TransactionStatus;
import com.scroogebank.crm.transaction_service.dto.TransactionsListResponse;
import com.scroogebank.crm.transaction_service.exception.TransactionNotFoundException;
import com.scroogebank.crm.transaction_service.security.AuthenticatedUser;
import com.scroogebank.crm.transaction_service.security.ForbiddenException;
import com.scroogebank.crm.transaction_service.security.RequestAuth;
import com.scroogebank.crm.transaction_service.service.ClientAccessValidator;
import com.scroogebank.crm.transaction_service.service.InMemoryTransactionsStore;
import com.scroogebank.crm.transaction_service.service.TransactionsService;
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

	/**
	 * Lists transactions with optional filters. Users must supply a clientId and
	 * have access to that client; otherwise an empty page is returned.
	 */
	@GetMapping("/transactions")
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
		requireAnyRole(user, "admin", "user");

		String authHeader = request.getHeader("Authorization");
		if (user.isUser()) {
			// We can only verify ownership for a specific clientId without enumerating
			// all user-owned clients from client-service. For safety, return empty
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

	/**
	 * Creates a new transaction. Admin-only.
	 */
	@PostMapping("/transactions")
	@ResponseStatus(HttpStatus.CREATED)
	public TransactionDto createTransaction(
		HttpServletRequest request,
		@Valid @RequestBody CreateTransactionRequest body
	) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		requireAnyRole(user, "admin");
		return transactionsService.create(body);
	}

	/**
	 * Fetches a transaction by id. Users receive a 404 when access is forbidden.
	 */
	@GetMapping("/transactions/{transactionId}")
	public TransactionDto getTransaction(HttpServletRequest request, @PathVariable String transactionId) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		requireAnyRole(user, "admin", "user");

		TransactionDto tx = transactionsService.get(transactionId);
		if (user.isUser()) {
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

	/**
	 * Deletes a transaction by id. Admin-only.
	 */
	@DeleteMapping("/transactions/{transactionId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void deleteTransaction(HttpServletRequest request, @PathVariable String transactionId) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		requireAnyRole(user, "admin");
		transactionsService.delete(transactionId);
	}

	/**
	 * Lists transactions scoped to a single client id after access validation.
	 */
	@GetMapping("/clients/{clientId}/transactions")
	public TransactionsListResponse listTransactionsForClient(
		HttpServletRequest request,
		@PathVariable String clientId,
		@RequestParam(defaultValue = "50") int limit,
		@RequestParam(defaultValue = "0") int offset
	) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		requireAnyRole(user, "admin", "user");
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

	/**
	 * Starts an import from the configured S3-backed transaction source. Admin-only.
	 */
	@PostMapping("/transactions/import")
	public ResponseEntity<ImportBatchDto> importTransactions(
		HttpServletRequest request,
		@RequestBody(required = false) ImportTransactionsRequest body
	) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		requireAnyRole(user, "admin");
		return ResponseEntity.status(HttpStatus.ACCEPTED).body(transactionsService.importTransactions(body));
	}

	/**
	 * Retrieves import batch status by id. Admin-only.
	 */
	@GetMapping("/transactions/imports/{importBatchId}")
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

