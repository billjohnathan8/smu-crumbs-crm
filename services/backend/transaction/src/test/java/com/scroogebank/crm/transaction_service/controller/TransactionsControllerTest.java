package com.scroogebank.crm.transaction_service.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.scroogebank.crm.transaction_service.dto.CreateTransactionRequest;
import com.scroogebank.crm.transaction_service.dto.TransactionDto;
import com.scroogebank.crm.transaction_service.dto.TransactionsListResponse;
import com.scroogebank.crm.transaction_service.exception.TransactionNotFoundException;
import com.scroogebank.crm.transaction_service.security.AuthenticatedUser;
import com.scroogebank.crm.transaction_service.security.ForbiddenException;
import com.scroogebank.crm.transaction_service.security.RequestAuth;
import com.scroogebank.crm.transaction_service.service.ClientAccessValidator;
import com.scroogebank.crm.transaction_service.service.InMemoryTransactionsStore;
import com.scroogebank.crm.transaction_service.service.TransactionsService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class TransactionsControllerTest {

	private TransactionsService transactionsService;
	private RequestAuth requestAuth;
	private ClientAccessValidator clientAccessValidator;
	private TransactionsController controller;
	private HttpServletRequest httpRequest;

	@BeforeEach
	void setUp() {
		transactionsService = mock(TransactionsService.class);
		requestAuth = mock(RequestAuth.class);
		clientAccessValidator = mock(ClientAccessValidator.class);
		controller = new TransactionsController(transactionsService, requestAuth, clientAccessValidator);
		httpRequest = mock(HttpServletRequest.class);
	}

	@Test
	void listTransactions_userWithoutClientId_returnsEmptyPage() {
		when(requestAuth.requireUser(httpRequest)).thenReturn(new AuthenticatedUser("usr_1", "user"));

		TransactionsListResponse response = controller.listTransactions(
			httpRequest, 50, 0, null, null, null, null, null
		);

		assertTrue(response.data().isEmpty());
		assertEquals(0, response.pagination().total());
	}

	@Test
	void listTransactions_userWithBlankClientId_returnsEmptyPage() {
		when(requestAuth.requireUser(httpRequest)).thenReturn(new AuthenticatedUser("usr_1", "user"));

		TransactionsListResponse response = controller.listTransactions(
			httpRequest, 50, 0, "  ", null, null, null, null
		);

		assertTrue(response.data().isEmpty());
	}

	@Test
	void listTransactions_adminWithoutClientId_delegatesToService() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_admin", "admin");
		when(requestAuth.requireUser(httpRequest)).thenReturn(admin);
		when(transactionsService.list(anyInt(), anyInt(), isNull(), isNull(), isNull(), isNull(), isNull()))
			.thenReturn(new InMemoryTransactionsStore.ListResult(List.of(), 0));

		TransactionsListResponse response = controller.listTransactions(
			httpRequest, 50, 0, null, null, null, null, null
		);

		assertEquals(0, response.pagination().total());
	}

	@Test
	void listTransactions_forbiddenRole_throws() {
		when(requestAuth.requireUser(httpRequest)).thenReturn(new AuthenticatedUser("usr_1", "auditor"));

		assertThrows(ForbiddenException.class, () ->
			controller.listTransactions(httpRequest, 50, 0, null, null, null, null, null)
		);
	}

	@Test
	void createTransaction_adminAllowed() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_admin", "admin");
		when(requestAuth.requireUser(httpRequest)).thenReturn(admin);
		CreateTransactionRequest body = mock(CreateTransactionRequest.class);
		TransactionDto dto = mock(TransactionDto.class);
		when(transactionsService.create(body)).thenReturn(dto);

		TransactionDto result = controller.createTransaction(httpRequest, body);

		assertEquals(dto, result);
	}

	@Test
	void createTransaction_userForbidden() {
		when(requestAuth.requireUser(httpRequest)).thenReturn(new AuthenticatedUser("usr_1", "user"));

		assertThrows(ForbiddenException.class, () ->
			controller.createTransaction(httpRequest, mock(CreateTransactionRequest.class))
		);
	}

	@Test
	void getTransaction_userForbiddenClient_throwsTransactionNotFound() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		when(requestAuth.requireUser(httpRequest)).thenReturn(user);
		when(httpRequest.getHeader("Authorization")).thenReturn("Bearer token");
		TransactionDto tx = mock(TransactionDto.class);
		when(tx.clientId()).thenReturn("clt_1");
		when(transactionsService.get("txn_1")).thenReturn(tx);
		doThrow(new ForbiddenException("forbidden"))
			.when(clientAccessValidator).requireClientAccessible(eq(user), eq("Bearer token"), eq("clt_1"));

		assertThrows(TransactionNotFoundException.class, () ->
			controller.getTransaction(httpRequest, "txn_1")
		);
	}

	@Test
	void deleteTransaction_userForbidden() {
		when(requestAuth.requireUser(httpRequest)).thenReturn(new AuthenticatedUser("usr_1", "user"));

		assertThrows(ForbiddenException.class, () ->
			controller.deleteTransaction(httpRequest, "txn_1")
		);
	}

	@Test
	void listTransactionsForClient_delegatesToService() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_admin", "admin");
		when(requestAuth.requireUser(httpRequest)).thenReturn(admin);
		when(httpRequest.getHeader("Authorization")).thenReturn("Bearer token");
		when(transactionsService.list(anyInt(), anyInt(), eq("clt_1"), isNull(), isNull(), isNull(), isNull()))
			.thenReturn(new InMemoryTransactionsStore.ListResult(List.of(), 0));

		TransactionsListResponse response = controller.listTransactionsForClient(httpRequest, "clt_1", 50, 0);

		assertEquals(0, response.pagination().total());
	}

	@Test
	void importTransactions_adminAllowed() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_admin", "admin");
		when(requestAuth.requireUser(httpRequest)).thenReturn(admin);

		var response = controller.importTransactions(httpRequest, null);

		assertEquals(202, response.getStatusCode().value());
	}

	@Test
	void importTransactions_userForbidden() {
		when(requestAuth.requireUser(httpRequest)).thenReturn(new AuthenticatedUser("usr_1", "user"));

		assertThrows(ForbiddenException.class, () ->
			controller.importTransactions(httpRequest, null)
		);
	}
}
