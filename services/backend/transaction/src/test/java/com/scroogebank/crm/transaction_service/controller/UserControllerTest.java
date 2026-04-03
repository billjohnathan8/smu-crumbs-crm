package com.scroogebank.crm.transaction_service.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.scroogebank.crm.transaction_service.config.AppProperties;
import com.scroogebank.crm.transaction_service.dto.CreateTransactionRequest;
import com.scroogebank.crm.transaction_service.dto.ImportBatchDto;
import com.scroogebank.crm.transaction_service.dto.ImportBatchStatus;
import com.scroogebank.crm.transaction_service.dto.TransactionDto;
import com.scroogebank.crm.transaction_service.dto.TransactionKind;
import com.scroogebank.crm.transaction_service.dto.TransactionStatus;
import com.scroogebank.crm.transaction_service.exception.ApiExceptionHandler;
import com.scroogebank.crm.transaction_service.logging.TransactionAuditLogger;
import com.scroogebank.crm.transaction_service.security.AuthenticatedUser;
import com.scroogebank.crm.transaction_service.security.RequestAuth;
import com.scroogebank.crm.transaction_service.security.ForbiddenException;
import com.scroogebank.crm.transaction_service.service.ClientAccessValidator;
import com.scroogebank.crm.transaction_service.service.InMemoryTransactionsStore;
import com.scroogebank.crm.transaction_service.service.TransactionsService;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * Exercises authorization and validation behavior for transaction endpoints.
 */
class UserControllerTest {
	private final TransactionsService transactionsService = mock(TransactionsService.class);
	private final RequestAuth requestAuth = mock(RequestAuth.class);
	private final ClientAccessValidator clientAccessValidator = mock(ClientAccessValidator.class);
	private final TransactionAuditLogger transactionAuditLogger = mock(TransactionAuditLogger.class);
	private final AppProperties appProperties = mock(AppProperties.class);
	private final MockMvc mockMvc = MockMvcBuilders
		.standaloneSetup(
			new TransactionsController(
				transactionsService,
				requestAuth,
				clientAccessValidator,
				transactionAuditLogger,
				appProperties
			)
		)
		.setControllerAdvice(new ApiExceptionHandler(false))
		.build();

	@Test
	void listTransactions_requiresAuth() throws Exception {
		when(requestAuth.requireUser(any())).thenThrow(new com.scroogebank.crm.transaction_service.security.UnauthorizedException("missing"));
		mockMvc.perform(get("/api/transactions"))
			.andExpect(status().isUnauthorized());
	}

	@Test
	void listTransactions_agentWithoutClientId_returnsOk() throws Exception {
		when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_1", "user"));
		mockMvc.perform(get("/api/transactions").header("Authorization", "Bearer x"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.data").isArray())
			.andExpect(jsonPath("$.data.length()").value(0))
			.andExpect(jsonPath("$.pagination.total").value(0));
	}

	@Test
	void listTransactions_agentWithClientId_checksOwnershipAndReturnsData() throws Exception {
		when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_1", "user"));
		when(transactionsService.list(
			any(Integer.class),
			any(Integer.class),
			any(),
			any(),
			any(),
			any(),
			any()
		)).thenReturn(new InMemoryTransactionsStore.ListResult(
			List.of(new TransactionDto(
				"txn_1",
				"clt_1",
				TransactionKind.D,
				new BigDecimal("1200.50"),
				LocalDate.parse("2026-02-01"),
				TransactionStatus.Completed,
				null,
				null
			)),
			1
		));

		mockMvc.perform(get("/api/transactions")
				.header("Authorization", "Bearer x")
				.queryParam("clientId", "clt_1"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.data.length()").value(1))
			.andExpect(jsonPath("$.pagination.total").value(1));

		verify(clientAccessValidator).requireClientAccessible(
			new AuthenticatedUser("usr_1", "user"),
			"Bearer x",
			"clt_1"
		);
	}

	@Test
	void listTransactions_forbiddenRole_returnsForbidden() throws Exception {
		when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_1", "viewer"));
		mockMvc.perform(get("/api/transactions").header("Authorization", "Bearer x"))
			.andExpect(status().isForbidden());
	}

	@Test
	void createTransaction_adminCreated() throws Exception {
		when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_1", "admin"));
		CreateTransactionRequest expected = new CreateTransactionRequest(
			"clt_1",
			TransactionKind.D,
			new BigDecimal("1200.50"),
			LocalDate.parse("2026-02-01"),
			TransactionStatus.Completed
		);
		when(transactionsService.create(any())).thenReturn(new TransactionDto(
			"txn_1",
			"clt_1",
			TransactionKind.D,
			new BigDecimal("1200.50"),
			LocalDate.parse("2026-02-01"),
			TransactionStatus.Completed,
			null,
			null
		));

		String createBody = """
			{
			  "clientId": "clt_1",
			  "transaction": "D",
			  "amount": 1200.50,
			  "date": "2026-02-01",
			  "status": "Completed"
			}
			""";
		mockMvc.perform(post("/api/transactions")
				.header("Authorization", "Bearer x")
				.contentType(MediaType.APPLICATION_JSON)
				.content(createBody))
			.andExpect(status().isCreated());

		ArgumentCaptor<CreateTransactionRequest> captor = ArgumentCaptor.forClass(CreateTransactionRequest.class);
		verify(transactionsService).create(captor.capture());
		CreateTransactionRequest actual = captor.getValue();
		assertEquals(expected.clientId(), actual.clientId());
		assertEquals(expected.transaction(), actual.transaction());
		assertEquals(0, expected.amount().compareTo(actual.amount()));
		assertEquals(expected.date(), actual.date());
		assertEquals(expected.status(), actual.status());
	}

	@Test
	void importTransactions_adminAccepted() throws Exception {
		when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_1", "admin"));
		when(transactionsService.importTransactions(any())).thenReturn(new ImportBatchDto(
			"imp_1",
			ImportBatchStatus.completed,
			null,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:01Z"),
			1,
			1,
			0,
			null
		));

		mockMvc.perform(post("/api/transactions/import")
				.header("Authorization", "Bearer x")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{}"))
			.andExpect(status().isAccepted());
	}

	@Test
	void getTransaction_agentWithoutClientAccess_returnsNotFound() throws Exception {
		when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_1", "user"));
		when(transactionsService.get("txn_1")).thenReturn(new TransactionDto(
			"txn_1",
			"clt_private",
			TransactionKind.W,
			new BigDecimal("9.99"),
			LocalDate.parse("2026-02-02"),
			TransactionStatus.Pending,
			null,
			null
		));
		doThrow(new ForbiddenException("forbidden")).when(clientAccessValidator).requireClientAccessible(
			any(AuthenticatedUser.class),
			any(),
			any()
		);

		mockMvc.perform(get("/api/transactions/txn_1").header("Authorization", "Bearer x"))
			.andExpect(status().isNotFound());
	}

	@Test
	void createTransaction_validationError_returnsBadRequest() throws Exception {
		when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_1", "admin"));
		mockMvc.perform(post("/api/transactions")
				.header("Authorization", "Bearer x")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"clientId\":\"\",\"amount\":-1}"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.error").value("validation_error"));
	}

	@ParameterizedTest
	@ValueSource(strings = {
		"' OR '1'='1",
		"clt_1; DROP TABLE transactions; --",
		"../../etc/passwd"
	})
	void createTransaction_adversarialClientId_returnsBadRequest(String clientIdPayload) throws Exception {
		when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_1", "admin"));
		String payload = """
			{
			  "clientId": "%s",
			  "transaction": "D",
			  "amount": 1200.50,
			  "date": "2026-02-01",
			  "status": "Completed"
			}
			""".formatted(clientIdPayload.replace("\"", "\\\""));

		mockMvc.perform(post("/api/transactions")
				.header("Authorization", "Bearer x")
				.contentType(MediaType.APPLICATION_JSON)
				.content(payload))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.error").value("validation_error"));
	}

	@Test
	void createTransaction_oversizedClientId_returnsBadRequest() throws Exception {
		when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_1", "admin"));
		String payload = """
			{
			  "clientId": "%s",
			  "transaction": "D",
			  "amount": 1200.50,
			  "date": "2026-02-01",
			  "status": "Completed"
			}
			""".formatted("c".repeat(500));

		mockMvc.perform(post("/api/transactions")
				.header("Authorization", "Bearer x")
				.contentType(MediaType.APPLICATION_JSON)
				.content(payload))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.error").value("validation_error"));
	}

	@Test
	void createTransaction_malformedJson_returnsBadRequest() throws Exception {
		when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_1", "admin"));

		mockMvc.perform(post("/api/transactions")
				.header("Authorization", "Bearer x")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"clientId\":\"clt_1\",\"transaction\":\"D\""))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.error").value("validation_error"));
	}

	@ParameterizedTest
	@ValueSource(strings = {
		"' OR '1'='1",
		"clt_1; DROP TABLE transactions; --",
		"../../etc/passwd"
	})
	void listTransactions_adversarialClientIdQuery_returnsBadRequest(String clientIdPayload) throws Exception {
		when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_1", "admin"));

		mockMvc.perform(get("/api/transactions")
				.header("Authorization", "Bearer x")
				.queryParam("clientId", clientIdPayload))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.error").value("validation_error"));
	}

	@Test
	void listTransactionsForClient_normalizesPaginationBounds() throws Exception {
		when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_1", "admin"));
		when(transactionsService.list(1, 0, "clt_1", null, null, null, null))
			.thenReturn(new InMemoryTransactionsStore.ListResult(List.of(), 0));

		mockMvc.perform(get("/api/clients/clt_1/transactions")
				.header("Authorization", "Bearer x")
				.queryParam("limit", "-3")
				.queryParam("offset", "-5"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.pagination.limit").value(1))
			.andExpect(jsonPath("$.pagination.offset").value(0));
	}
}
