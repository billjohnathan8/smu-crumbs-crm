package com.scroogebank.crm.transaction_service.controller;

import com.scroogebank.crm.transaction_service.api.Pagination;
import com.scroogebank.crm.transaction_service.dto.CreateTransactionRequest;
import com.scroogebank.crm.transaction_service.dto.ImportBatchDto;
import com.scroogebank.crm.transaction_service.dto.ImportTransactionsRequest;
import com.scroogebank.crm.transaction_service.dto.TransactionDto;
import com.scroogebank.crm.transaction_service.dto.TransactionKind;
import com.scroogebank.crm.transaction_service.dto.TransactionStatus;
import com.scroogebank.crm.transaction_service.dto.TransactionsListResponse;
import com.scroogebank.crm.transaction_service.dto.UpdateTransactionRequest;
import com.scroogebank.crm.transaction_service.exception.TransactionNotFoundException;
import com.scroogebank.crm.transaction_service.logging.TransactionAuditLogger;
import com.scroogebank.crm.transaction_service.security.AuthenticatedUser;
import com.scroogebank.crm.transaction_service.security.ForbiddenException;
import com.scroogebank.crm.transaction_service.security.RequestAuth;
import com.scroogebank.crm.transaction_service.service.ClientAccessValidator;
import com.scroogebank.crm.transaction_service.service.InMemoryTransactionsStore;
import com.scroogebank.crm.transaction_service.service.TransactionsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import java.time.LocalDate;
import java.util.Objects;
import java.util.StringJoiner;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.format.annotation.DateTimeFormat.ISO;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.validation.annotation.Validated;

/**
 * REST endpoints for transaction CRUD and import operations.
 */
@RestController
@Validated
@RequestMapping("/api")
@Tag(name = "Transactions")
@SecurityRequirement(name = "bearerAuth")
@ApiResponses({
	@ApiResponse(responseCode = "400", description = "Validation failed"),
	@ApiResponse(responseCode = "401", description = "Unauthorized"),
	@ApiResponse(responseCode = "403", description = "Forbidden"),
	@ApiResponse(responseCode = "404", description = "Not found"),
	@ApiResponse(responseCode = "500", description = "Internal error")
})
public class TransactionsController {
	private static final String SYSTEM_IMPORT_CLIENT_ID = "SYSTEM_IMPORT";
	private final TransactionsService transactionsService;
	private final RequestAuth requestAuth;
	private final ClientAccessValidator clientAccessValidator;
	private final TransactionAuditLogger transactionAuditLogger;

	public TransactionsController(
		TransactionsService transactionsService,
		RequestAuth requestAuth,
		ClientAccessValidator clientAccessValidator,
		TransactionAuditLogger transactionAuditLogger
	) {
		this.transactionsService = transactionsService;
		this.requestAuth = requestAuth;
		this.clientAccessValidator = clientAccessValidator;
		this.transactionAuditLogger = transactionAuditLogger;
	}

	/**
	 * Lists transactions with optional filters. Users must supply a clientId and
	 * have access to that client; otherwise an empty page is returned.
	 */
	@GetMapping("/transactions")
	@Operation(summary = "List transactions")
	public TransactionsListResponse listTransactions(
		HttpServletRequest request,
		@RequestParam(defaultValue = "50") int limit,
		@RequestParam(defaultValue = "0") int offset,
		@RequestParam(required = false) @Pattern(regexp = "^$|^[A-Za-z0-9_-]{1,128}$") String clientId,
		@RequestParam(required = false) TransactionStatus status,
		@RequestParam(required = false, name = "transaction") TransactionKind kind,
		@RequestParam(required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate fromDate,
		@RequestParam(required = false) @DateTimeFormat(iso = ISO.DATE) LocalDate toDate
	) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		requireAnyRole(user, "user", "admin");
		if (clientId != null && !clientId.isBlank() && !clientId.matches("^[A-Za-z0-9_-]{1,128}$")) {
			throw new IllegalArgumentException("invalid clientId");
		}

		String authHeader = request.getHeader("Authorization");
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
	@Operation(summary = "Create transaction")
	public TransactionDto createTransaction(
		HttpServletRequest request,
		@Valid @RequestBody CreateTransactionRequest body
	) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		requireAnyRole(user, "admin");
		TransactionDto created = transactionsService.create(body);
		publishAuditSafe(
			"CREATE",
			"Transaction ID",
			null,
			created.id(),
			user.userId(),
			created.clientId(),
			requestId(request),
			request.getHeader("Authorization")
		);
		return created;
	}

	/**
	 * Fetches a transaction by id. Users receive a 404 when access is forbidden.
	 */
	@GetMapping("/transactions/{transactionId}")
	@Operation(summary = "Get transaction by id")
	public TransactionDto getTransaction(HttpServletRequest request, @Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$") @PathVariable String transactionId) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		requireAnyRole(user, "user", "admin");

		TransactionDto tx = transactionsService.get(transactionId);
		String authHeader = request.getHeader("Authorization");
		try {
			clientAccessValidator.requireClientAccessible(user, authHeader, tx.clientId());
		}
		catch (ForbiddenException ex) {
			throw new TransactionNotFoundException(transactionId);
		}
		publishAuditSafe(
			"READ",
			"Transaction ID",
			null,
			tx.id(),
			user.userId(),
			tx.clientId(),
			requestId(request),
			request.getHeader("Authorization")
		);
		return tx;
	}

	/**
	 * Updates an existing transaction. Admin-only.
	 */
	@PutMapping("/transactions/{transactionId}")
	@Operation(summary = "Update transaction")
	public TransactionDto updateTransaction(
		HttpServletRequest request,
		@Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$") @PathVariable String transactionId,
		@Valid @RequestBody UpdateTransactionRequest body
	) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		requireAnyRole(user, "admin");
		TransactionDto before = transactionsService.get(transactionId);
		TransactionDto after = transactionsService.update(transactionId, body);

		StringJoiner attributes = new StringJoiner("|");
		StringJoiner beforeValues = new StringJoiner("|");
		StringJoiner afterValues = new StringJoiner("|");
		collectChange(attributes, beforeValues, afterValues, "clientId", before.clientId(), after.clientId());
		collectChange(attributes, beforeValues, afterValues, "transaction", before.transaction().name(), after.transaction().name());
		collectChange(attributes, beforeValues, afterValues, "amount", before.amount().toPlainString(), after.amount().toPlainString());
		collectChange(attributes, beforeValues, afterValues, "date", before.date().toString(), after.date().toString());
		collectChange(attributes, beforeValues, afterValues, "status", before.status().name(), after.status().name());

		String attributeName = attributes.length() == 0 ? "Transaction ID" : attributes.toString();
		String beforeValue = beforeValues.length() == 0 ? before.id() : beforeValues.toString();
		String afterValue = afterValues.length() == 0 ? after.id() : afterValues.toString();

		publishAuditSafe(
			"UPDATE",
			attributeName,
			beforeValue,
			afterValue,
			user.userId(),
			after.clientId(),
			requestId(request),
			request.getHeader("Authorization")
		);
		return after;
	}

	/**
	 * Deletes a transaction by id. Admin-only.
	 */
	@DeleteMapping("/transactions/{transactionId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@Operation(summary = "Delete transaction")
	public void deleteTransaction(HttpServletRequest request, @Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$") @PathVariable String transactionId) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		requireAnyRole(user, "admin");
		TransactionDto existing = transactionsService.get(transactionId);
		transactionsService.delete(transactionId);
		publishAuditSafe(
			"DELETE",
			"Transaction ID",
			existing.id(),
			null,
			user.userId(),
			existing.clientId(),
			requestId(request),
			request.getHeader("Authorization")
		);
	}

	/**
	 * Lists transactions scoped to a single client id after access validation.
	 */
	@GetMapping("/clients/{clientId}/transactions")
	@Operation(summary = "List transactions for client")
	public TransactionsListResponse listTransactionsForClient(
		HttpServletRequest request,
		@Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$") @PathVariable String clientId,
		@RequestParam(defaultValue = "50") int limit,
		@RequestParam(defaultValue = "0") int offset
	) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		requireAnyRole(user, "user", "admin");
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
	@Operation(summary = "Start transaction import")
	public ResponseEntity<ImportBatchDto> importTransactions(
		HttpServletRequest request,
		@RequestBody(required = false) ImportTransactionsRequest body
	) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		requireAnyRole(user, "admin");
		ImportBatchDto batch = transactionsService.importTransactions(body);
		String sourcePath = body == null ? null : body.sourcePath();
		publishAuditSafe(
			"CREATE",
			"importBatchId|sourcePath|status|totalRecords|importedRecords|failedRecords",
			null,
			batch.importBatchId()
				+ "|" + String.valueOf(sourcePath)
				+ "|" + batch.status().name()
				+ "|" + batch.totalRecords()
				+ "|" + batch.importedRecords()
				+ "|" + batch.failedRecords(),
			user.userId(),
			resolveImportAuditClientId(batch.requestedClientId()),
			requestId(request),
			request.getHeader("Authorization")
		);
		return ResponseEntity.status(HttpStatus.ACCEPTED).body(batch);
	}

	/**
	 * Retrieves import batch status by id. Admin-only.
	 */
	@GetMapping("/transactions/imports/{importBatchId}")
	@Operation(summary = "Get import batch status")
	public ImportBatchDto getImportBatch(HttpServletRequest request, @Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$") @PathVariable String importBatchId) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		requireAnyRole(user, "admin");
		ImportBatchDto batch = transactionsService.getBatch(importBatchId);
		publishAuditSafe(
			"READ",
			"Import Batch ID",
			null,
			batch.importBatchId(),
			user.userId(),
			resolveImportAuditClientId(batch.requestedClientId()),
			requestId(request),
			request.getHeader("Authorization")
		);
		return batch;
	}

	private static int normalizeLimit(int limit) {
		return Math.max(1, Math.min(200, limit));
	}

	private static int normalizeOffset(int offset) {
		return Math.max(0, offset);
	}

	private static void collectChange(
		StringJoiner attributes,
		StringJoiner beforeValues,
		StringJoiner afterValues,
		String fieldName,
		String beforeValue,
		String afterValue
	) {
		if (!Objects.equals(beforeValue, afterValue)) {
			attributes.add(fieldName);
			beforeValues.add(beforeValue);
			afterValues.add(afterValue);
		}
	}

	private void publishAuditSafe(
		String action,
		String attributeName,
		String beforeValue,
		String afterValue,
		String userId,
		String clientId,
		String correlationId,
		String authorizationHeader
	) {
		transactionAuditLogger.logAuditEvent(
			action,
			attributeName,
			beforeValue,
			afterValue,
			userId,
			clientId,
			correlationId,
			authorizationHeader
		);
	}

	private static String requestId(HttpServletRequest request) {
		Object value = request.getAttribute("requestId");
		return value == null ? null : value.toString();
	}

	private static String resolveImportAuditClientId(String requestedClientId) {
		if (requestedClientId == null || requestedClientId.isBlank()) {
			return SYSTEM_IMPORT_CLIENT_ID;
		}
		return requestedClientId.trim();
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
