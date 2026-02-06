package com.itsa.crm.clients_service.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.itsa.crm.clients_service.dto.AccountCreateRequest;
import com.itsa.crm.clients_service.dto.AccountDto;
import com.itsa.crm.clients_service.dto.AccountStatus;
import com.itsa.crm.clients_service.dto.AccountType;
import com.itsa.crm.clients_service.entity.AccountEntity;
import com.itsa.crm.clients_service.entity.ClientEntity;
import com.itsa.crm.clients_service.exception.AccountNotFoundException;
import com.itsa.crm.clients_service.exception.ClientNotFoundException;
import com.itsa.crm.clients_service.logging.ClientAuditLogger;
import com.itsa.crm.clients_service.repository.AccountRepository;
import com.itsa.crm.clients_service.repository.ClientRepository;
import com.itsa.crm.clients_service.security.AuthenticatedUser;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link AccountServiceImpl} business logic.
 */
class AccountServiceImplTest {
	private AccountRepository accountRepository;
	private ClientRepository clientRepository;
	private ClientAuditLogger auditLogger;
	private AccountServiceImpl accountService;

	@BeforeEach
	void setUp() {
		accountRepository = mock(AccountRepository.class);
		clientRepository = mock(ClientRepository.class);
		auditLogger = mock(ClientAuditLogger.class);
		accountService = new AccountServiceImpl(accountRepository, clientRepository, auditLogger);
	}

	@Test
	void createAccount_adminCreatesAndPublishesAudit() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_admin", "admin");
		AccountCreateRequest request = new AccountCreateRequest(
			"clt_1",
			AccountType.Savings,
			AccountStatus.Active,
			LocalDate.parse("2026-02-01"),
			new BigDecimal("500.00"),
			"USD",
			"br_1"
		);
		ClientEntity client = client(1L, "usr_owner");
		AccountEntity saved = account(10L, client);
		when(clientRepository.findById(1L)).thenReturn(Optional.of(client));
		when(accountRepository.save(any(AccountEntity.class))).thenReturn(saved);

		AccountDto created = accountService.createAccount(admin, request, "Bearer x", "req-1");

		assertThat(created.accountId()).isEqualTo("acc_10");
		assertThat(created.clientId()).isEqualTo("clt_1");
		verify(auditLogger).logAuditEvent(
			eq("CREATE"),
			eq("Account ID"),
			eq(null),
			eq("acc_10"),
			eq("usr_admin"),
			eq("clt_1"),
			eq("req-1"),
			eq("Bearer x")
		);
	}

	@Test
	void createAccount_whenAuthorizationHeaderBlank_skipsAuditLogging() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_admin", "admin");
		AccountCreateRequest request = new AccountCreateRequest(
			"clt_1",
			AccountType.Savings,
			AccountStatus.Active,
			LocalDate.parse("2026-02-01"),
			new BigDecimal("500.00"),
			"USD",
			"br_1"
		);
		ClientEntity client = client(1L, "usr_owner");
		AccountEntity saved = account(10L, client);
		when(clientRepository.findById(1L)).thenReturn(Optional.of(client));
		when(accountRepository.save(any(AccountEntity.class))).thenReturn(saved);

		AccountDto created = accountService.createAccount(admin, request, "   ", "req-1");

		assertThat(created.accountId()).isEqualTo("acc_10");
		verify(auditLogger, never()).logAuditEvent(any(), any(), any(), any(), any(), any(), any(), any());
	}

	@Test
	void createAccount_agentOnUnownedClient_throwsNotFound() {
		AuthenticatedUser agent = new AuthenticatedUser("usr_1", "agent");
		AccountCreateRequest request = new AccountCreateRequest(
			"clt_2",
			AccountType.Checking,
			AccountStatus.Active,
			LocalDate.parse("2026-02-01"),
			new BigDecimal("100.00"),
			"USD",
			"br_1"
		);
		when(clientRepository.findById(2L)).thenReturn(Optional.of(client(2L, "usr_other")));

		assertThatThrownBy(() -> accountService.createAccount(agent, request, "Bearer x", "req-1"))
			.isInstanceOf(ClientNotFoundException.class);
		verify(accountRepository, never()).save(any());
	}

	@Test
	void getAccount_agentCannotAccessOtherOwner_throwsAccountNotFound() {
		AuthenticatedUser agent = new AuthenticatedUser("usr_1", "agent");
		AccountEntity entity = account(5L, client(1L, "usr_other"));
		when(accountRepository.findById(5L)).thenReturn(Optional.of(entity));

		assertThatThrownBy(() -> accountService.getAccount(agent, "acc_5"))
			.isInstanceOf(AccountNotFoundException.class);
	}

	@Test
	void deleteAccount_whenAuditFails_stillDeletes() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_admin", "admin");
		AccountEntity existing = account(7L, client(2L, "usr_2"));
		when(accountRepository.findById(7L)).thenReturn(Optional.of(existing));
		doThrow(new RuntimeException("log down")).when(auditLogger).logAuditEvent(
			any(),
			any(),
			any(),
			any(),
			any(),
			any(),
			any(),
			any()
		);

		accountService.deleteAccount(admin, "acc_7", "Bearer x", "req-7");

		verify(accountRepository).delete(existing);
	}

	@Test
	void listAccounts_mapsResultsToDtos() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_admin", "admin");
		ClientEntity client = client(3L, "usr_3");
		when(clientRepository.findById(3L)).thenReturn(Optional.of(client));
		when(accountRepository.findByClientId(3L)).thenReturn(List.of(
			account(11L, client),
			account(12L, client)
		));

		List<AccountDto> accounts = accountService.listAccounts(admin, "clt_3");

		assertThat(accounts).hasSize(2);
		assertThat(accounts.get(0).accountId()).isEqualTo("acc_11");
		assertThat(accounts.get(1).accountId()).isEqualTo("acc_12");
	}

	private ClientEntity client(Long id, String assignedAgentId) {
		ClientEntity entity = new ClientEntity();
		entity.setId(id);
		entity.setAssignedAgentId(assignedAgentId);
		return entity;
	}

	private AccountEntity account(Long id, ClientEntity client) {
		AccountEntity entity = new AccountEntity();
		setField(entity, "id", id);
		entity.setClient(client);
		entity.setAccountType(AccountType.Savings);
		entity.setAccountStatus(AccountStatus.Active);
		entity.setOpeningDate(LocalDate.parse("2026-02-01"));
		entity.setInitialDeposit(new BigDecimal("100.00"));
		entity.setCurrency("USD");
		entity.setBranchId("br_1");
		return entity;
	}

	private void setField(Object target, String name, Object value) {
		try {
			Field field = target.getClass().getDeclaredField(name);
			field.setAccessible(true);
			field.set(target, value);
		}
		catch (ReflectiveOperationException ex) {
			throw new IllegalStateException(ex);
		}
	}
}
