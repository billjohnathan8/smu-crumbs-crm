package com.scroogebank.crm.transaction_service.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.scroogebank.crm.transaction_service.config.AppProperties;
import com.scroogebank.crm.transaction_service.dto.CreateTransactionRequest;
import com.scroogebank.crm.transaction_service.dto.ImportBatchDto;
import com.scroogebank.crm.transaction_service.dto.ImportBatchStatus;
import com.scroogebank.crm.transaction_service.dto.TransactionDto;
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
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.function.Executable;

class TransactionsControllerTest {

	private final TransactionsService transactionsService = mock(TransactionsService.class);
	private final RequestAuth requestAuth = mock(RequestAuth.class);
	private final ClientAccessValidator clientAccessValidator = mock(ClientAccessValidator.class);
	private final TransactionAuditLogger transactionAuditLogger = mock(TransactionAuditLogger.class);
	private final AppProperties appProperties = mock(AppProperties.class);
	private final TransactionsController controller = createController();
	private final HttpServletRequest httpRequest = createHttpRequest();

	@org.junit.jupiter.api.Test
	void listTransactions_userWithoutClientId_returnsEmptyPage() {
		when(requestAuth.requireUser(httpRequest)).thenReturn(new AuthenticatedUser("usr_1", "user"));

		TransactionsListResponse response = controller.listTransactions(
			httpRequest, 50, 0, null, null, null, null, null
		);

		assertTrue(response.data().isEmpty());
		assertEquals(0, response.pagination().total());
	}

	@org.junit.jupiter.api.Test
	void listTransactions_userWithBlankClientId_returnsEmptyPage() {
		when(requestAuth.requireUser(httpRequest)).thenReturn(new AuthenticatedUser("usr_1", "user"));

		TransactionsListResponse response = controller.listTransactions(
			httpRequest, 50, 0, "  ", null, null, null, null
		);

		assertTrue(response.data().isEmpty());
	}

	@org.junit.jupiter.api.Test
	void listTransactions_adminWithoutClientId_delegatesToService() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_1", "super_admin");
		when(requestAuth.requireUser(httpRequest)).thenReturn(admin);
		when(transactionsService.list(anyInt(), anyInt(), isNull(), isNull(), isNull(), isNull(), isNull()))
			.thenReturn(new InMemoryTransactionsStore.ListResult(List.of(), 0));

		TransactionsListResponse response = controller.listTransactions(
			httpRequest, 50, 0, null, null, null, null, null
		);

		assertEquals(0, response.pagination().total());
	}

	@org.junit.jupiter.api.Test
	void listTransactions_forbiddenRole_throws() {
		when(requestAuth.requireUser(httpRequest)).thenReturn(new AuthenticatedUser("usr_1", "auditor"));

		assertForbidden(() -> controller.listTransactions(httpRequest, 50, 0, null, null, null, null, null));
	}

	@org.junit.jupiter.api.Test
	void createTransaction_adminAllowed() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_1", "super_admin");
		when(requestAuth.requireUser(httpRequest)).thenReturn(admin);
		CreateTransactionRequest body = mock(CreateTransactionRequest.class);
		TransactionDto dto = mock(TransactionDto.class);
		when(dto.id()).thenReturn("txn_1");
		when(dto.clientId()).thenReturn("clt_1");
		when(transactionsService.create(body)).thenReturn(dto);

		TransactionDto result = controller.createTransaction(httpRequest, body);

		assertEquals(dto, result);
		verify(transactionAuditLogger).logAuditEvent(
			"CREATE",
			"Transaction ID",
			null,
			"txn_1",
			"usr_1",
			"clt_1",
			"req_1",
			"Bearer token"
		);
	}

	@org.junit.jupiter.api.Test
	void createTransaction_userForbidden() {
		when(requestAuth.requireUser(httpRequest)).thenReturn(new AuthenticatedUser("usr_1", "user"));

		assertForbidden(() -> controller.createTransaction(httpRequest, mock(CreateTransactionRequest.class)));
	}

	@org.junit.jupiter.api.Test
	void updateTransaction_adminForbiddenWhenDisabled() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_1", "super_admin");
		when(requestAuth.requireUser(httpRequest)).thenReturn(admin);
		assertForbiddenMessage(
			"Transaction editing is disabled.",
			() -> controller.updateTransaction(httpRequest, "txn_1", mock(UpdateTransactionRequest.class))
		);
	}

	@org.junit.jupiter.api.Test
	void updateTransaction_adminAllowedWhenEnabled() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_1", "super_admin");
		when(requestAuth.requireUser(httpRequest)).thenReturn(admin);
		when(appProperties.isTransactionUpdatesEnabled()).thenReturn(true);
		UpdateTransactionRequest body = mock(UpdateTransactionRequest.class);
		TransactionDto before = mock(TransactionDto.class);
		TransactionDto after = mock(TransactionDto.class);
		when(before.id()).thenReturn("txn_1");
		when(before.clientId()).thenReturn("clt_1");
		when(before.transaction()).thenReturn(com.scroogebank.crm.transaction_service.dto.TransactionKind.D);
		when(before.amount()).thenReturn(new java.math.BigDecimal("100.00"));
		when(before.date()).thenReturn(java.time.LocalDate.parse("2026-01-01"));
		when(before.status()).thenReturn(com.scroogebank.crm.transaction_service.dto.TransactionStatus.Completed);
		when(after.id()).thenReturn("txn_1");
		when(after.clientId()).thenReturn("clt_1");
		when(after.transaction()).thenReturn(com.scroogebank.crm.transaction_service.dto.TransactionKind.W);
		when(after.amount()).thenReturn(new java.math.BigDecimal("50.00"));
		when(after.date()).thenReturn(java.time.LocalDate.parse("2026-01-02"));
		when(after.status()).thenReturn(com.scroogebank.crm.transaction_service.dto.TransactionStatus.Pending);
		when(transactionsService.get("txn_1")).thenReturn(before);
		when(transactionsService.update("txn_1", body)).thenReturn(after);

		TransactionDto result = controller.updateTransaction(httpRequest, "txn_1", body);

		assertEquals(after, result);
	}

	@org.junit.jupiter.api.Test
	void updateTransaction_userForbidden() {
		when(requestAuth.requireUser(httpRequest)).thenReturn(new AuthenticatedUser("usr_1", "user"));

		assertForbidden(() -> controller.updateTransaction(httpRequest, "txn_1", mock(UpdateTransactionRequest.class)));
	}

	@org.junit.jupiter.api.Test
	void getTransaction_userForbiddenClient_throwsTransactionNotFound() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		when(requestAuth.requireUser(httpRequest)).thenReturn(user);
		when(httpRequest.getHeader("Authorization")).thenReturn("Bearer token");
		TransactionDto tx = mock(TransactionDto.class);
		when(tx.clientId()).thenReturn("clt_1");
		when(transactionsService.get("txn_1")).thenReturn(tx);
		doThrow(new ForbiddenException("forbidden"))
			.when(clientAccessValidator).requireClientAccessible(eq(user), eq("Bearer token"), eq("clt_1"));

		assertTransactionNotFound("txn_1", () -> controller.getTransaction(httpRequest, "txn_1"));
	}

	@org.junit.jupiter.api.Test
	void deleteTransaction_userForbidden() {
		when(requestAuth.requireUser(httpRequest)).thenReturn(new AuthenticatedUser("usr_1", "user"));

		assertForbidden(() -> controller.deleteTransaction(httpRequest, "txn_1"));
	}

	@org.junit.jupiter.api.Test
	void listTransactionsForClient_delegatesToService() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_1", "super_admin");
		when(requestAuth.requireUser(httpRequest)).thenReturn(admin);
		when(httpRequest.getHeader("Authorization")).thenReturn("Bearer token");
		when(transactionsService.list(anyInt(), anyInt(), eq("clt_1"), isNull(), isNull(), isNull(), isNull()))
			.thenReturn(new InMemoryTransactionsStore.ListResult(List.of(), 0));

		TransactionsListResponse response = controller.listTransactionsForClient(httpRequest, "clt_1", 50, 0);

		assertEquals(0, response.pagination().total());
	}

	@org.junit.jupiter.api.Test
	void importTransactions_adminAllowed() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_1", "super_admin");
		when(requestAuth.requireUser(httpRequest)).thenReturn(admin);
		ImportBatchDto batch = new ImportBatchDto(
			"imp_1",
			ImportBatchStatus.completed,
			"clt_1",
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:01Z"),
			10,
			9,
			1,
			null
		);
		when(transactionsService.importTransactions(null)).thenReturn(batch);

		var response = controller.importTransactions(httpRequest, null);

		assertEquals(202, response.getStatusCode().value());
		assertEquals(batch, response.getBody());
		verify(transactionAuditLogger).logAuditEvent(
			"CREATE",
			"importBatchId|sourcePath|status|totalRecords|importedRecords|failedRecords",
			null,
			"imp_1|null|completed|10|9|1",
			"usr_1",
			"clt_1",
			"req_1",
			"Bearer token"
		);
	}

	@org.junit.jupiter.api.Test
	void importTransactions_adminAllowed_withoutRequestedClient_usesSystemImportClientId() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_1", "super_admin");
		when(requestAuth.requireUser(httpRequest)).thenReturn(admin);
		ImportBatchDto batch = new ImportBatchDto(
			"imp_2",
			ImportBatchStatus.completed,
			null,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:01Z"),
			5,
			5,
			0,
			null
		);
		when(transactionsService.importTransactions(null)).thenReturn(batch);

		controller.importTransactions(httpRequest, null);

		verify(transactionAuditLogger).logAuditEvent(
			"CREATE",
			"importBatchId|sourcePath|status|totalRecords|importedRecords|failedRecords",
			null,
			"imp_2|null|completed|5|5|0",
			"usr_1",
			"SYSTEM_IMPORT",
			"req_1",
			"Bearer token"
		);
	}

	@org.junit.jupiter.api.Test
	void importTransactions_userForbidden() {
		when(requestAuth.requireUser(httpRequest)).thenReturn(new AuthenticatedUser("usr_1", "user"));

		assertForbidden(() -> controller.importTransactions(httpRequest, null));
	}

	@org.junit.jupiter.api.Test
	void getImportBatch_adminAllowed_logsReadAudit() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_1", "super_admin");
		when(requestAuth.requireUser(httpRequest)).thenReturn(admin);
		ImportBatchDto batch = new ImportBatchDto(
			"imp_3",
			ImportBatchStatus.completed,
			"clt_9",
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:01Z"),
			2,
			2,
			0,
			null
		);
		when(transactionsService.getBatch("imp_3")).thenReturn(batch);

		ImportBatchDto result = controller.getImportBatch(httpRequest, "imp_3");

		assertEquals(batch, result);
		verify(transactionAuditLogger).logAuditEvent(
			"READ",
			"Import Batch ID",
			null,
			"imp_3",
			"usr_1",
			"clt_9",
			"req_1",
			"Bearer token"
		);
	}

	private void assertForbidden(Executable executable) {
		ForbiddenException exception = assertThrows(ForbiddenException.class, executable);
		assertEquals("forbidden", exception.getMessage());
	}

	private void assertForbiddenMessage(String expectedMessage, Executable executable) {
		ForbiddenException exception = assertThrows(ForbiddenException.class, executable);
		assertEquals(expectedMessage, exception.getMessage());
	}

	private void assertTransactionNotFound(String transactionId, Executable executable) {
		TransactionNotFoundException exception = assertThrows(TransactionNotFoundException.class, executable);
		assertEquals("Transaction not found: " + transactionId, exception.getMessage());
	}

	private TransactionsController createController() {
		when(appProperties.isTransactionUpdatesEnabled()).thenReturn(false);
		return new TransactionsController(
			transactionsService,
			requestAuth,
			clientAccessValidator,
			transactionAuditLogger,
			appProperties
		);
	}

	private HttpServletRequest createHttpRequest() {
		HttpServletRequest request = mock(HttpServletRequest.class);
		when(request.getHeader("Authorization")).thenReturn("Bearer token");
		when(request.getAttribute("requestId")).thenReturn("req_1");
		return request;
	}
}
