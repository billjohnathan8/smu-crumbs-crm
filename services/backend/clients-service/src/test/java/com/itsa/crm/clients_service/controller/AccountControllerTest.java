package com.itsa.crm.clients_service.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.itsa.crm.clients_service.dto.AccountDto;
import com.itsa.crm.clients_service.dto.AccountStatus;
import com.itsa.crm.clients_service.dto.AccountType;
import com.itsa.crm.clients_service.exception.AccountNotFoundException;
import com.itsa.crm.clients_service.exception.ApiExceptionHandler;
import com.itsa.crm.clients_service.security.AuthenticatedUser;
import com.itsa.crm.clients_service.security.RequestAuth;
import com.itsa.crm.clients_service.service.AccountService;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * Web MVC tests for {@link AccountController}.
 */
class AccountControllerTest {
	private static final String AUTH_HEADER = "Bearer test";

	private MockMvc mockMvc;
	private AccountService accountService;

	@BeforeEach
	void setUp() {
		accountService = mock(AccountService.class);
		RequestAuth requestAuth = mock(RequestAuth.class);
		when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_1", "agent"));

		mockMvc = MockMvcBuilders.standaloneSetup(new AccountController(accountService, requestAuth))
			.setControllerAdvice(new ApiExceptionHandler())
			.build();
	}

	@Test
	void createAccount_returnsCreated() throws Exception {
		when(accountService.createAccount(any(), any(), any(), any())).thenReturn(accountDto("acc_10", "clt_1"));

		mockMvc.perform(post("/api/accounts")
				.header("Authorization", AUTH_HEADER)
				.requestAttr("requestId", "req-1")
				.contentType(MediaType.APPLICATION_JSON)
				.content(createRequestJson("clt_1")))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.accountId").value("acc_10"));

		verify(accountService).createAccount(any(), any(), eq(AUTH_HEADER), eq("req-1"));
	}

	@Test
	void createAccount_validationError_returnsBadRequest() throws Exception {
		mockMvc.perform(post("/api/accounts")
				.header("Authorization", AUTH_HEADER)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"clientId\":\"\",\"initialDeposit\":-1}"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.error").value("validation_error"));
	}

	@Test
	void getAndListEndpoints_returnData() throws Exception {
		when(accountService.getAccount(any(), eq("acc_1"))).thenReturn(accountDto("acc_1", "clt_1"));
		when(accountService.listAccounts(any(), eq("clt_1"))).thenReturn(List.of(accountDto("acc_1", "clt_1")));

		mockMvc.perform(get("/api/accounts/acc_1").header("Authorization", AUTH_HEADER))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.accountId").value("acc_1"));

		mockMvc.perform(get("/api/clients/clt_1/accounts").header("Authorization", AUTH_HEADER))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$[0].clientId").value("clt_1"));
	}

	@Test
	void deleteAccount_notFoundAndNoContent() throws Exception {
		when(accountService.getAccount(any(), any())).thenThrow(new AccountNotFoundException("acc_404"));
		doNothing().when(accountService).deleteAccount(any(), eq("acc_1"), any(), any());

		mockMvc.perform(get("/api/accounts/acc_404").header("Authorization", AUTH_HEADER))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.error").value("not_found"));

		mockMvc.perform(delete("/api/accounts/acc_1")
				.header("Authorization", AUTH_HEADER)
				.requestAttr("requestId", "req-del"))
			.andExpect(status().isNoContent());

		verify(accountService).deleteAccount(any(), eq("acc_1"), eq(AUTH_HEADER), eq("req-del"));
	}

	private String createRequestJson(String clientId) {
		return """
			{
			  "clientId": "%s",
			  "accountType": "Savings",
			  "accountStatus": "Active",
			  "openingDate": "2026-02-01",
			  "initialDeposit": 100.00,
			  "currency": "USD",
			  "branchId": "br_1"
			}
			""".formatted(clientId);
	}

	private AccountDto accountDto(String accountId, String clientId) {
		return new AccountDto(
			accountId,
			clientId,
			AccountType.Savings,
			AccountStatus.Active,
			LocalDate.parse("2026-02-01"),
			new BigDecimal("100.00"),
			"USD",
			"br_1",
			Instant.parse("2026-02-05T00:00:00Z")
		);
	}
}
