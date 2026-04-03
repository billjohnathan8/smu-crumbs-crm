package com.scroogebank.crm.client_service.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.scroogebank.crm.client_service.config.AppProperties;
import com.scroogebank.crm.client_service.dto.AccountCreateRequest;
import com.scroogebank.crm.client_service.dto.AccountDto;
import com.scroogebank.crm.client_service.dto.AccountOpeningOptionsDto;
import com.scroogebank.crm.client_service.dto.AccountStatus;
import com.scroogebank.crm.client_service.dto.AccountType;
import com.scroogebank.crm.client_service.dto.AccountUpdateRequest;
import com.scroogebank.crm.client_service.dto.IdentityVerificationStatus;
import com.scroogebank.crm.client_service.entity.AccountEntity;
import com.scroogebank.crm.client_service.entity.ClientEntity;
import com.scroogebank.crm.client_service.exception.AccountNotFoundException;
import com.scroogebank.crm.client_service.exception.ClientNotFoundException;
import com.scroogebank.crm.client_service.logging.ClientAuditLogger;
import com.scroogebank.crm.client_service.repository.AccountRepository;
import com.scroogebank.crm.client_service.repository.ClientRepository;
import com.scroogebank.crm.client_service.security.AuthenticatedUser;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.mockito.ArgumentCaptor;
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
		accountService = new AccountServiceImpl(accountRepository, clientRepository, auditLogger, new AppProperties());
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
			"sgd",
			"sg-001"
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
			"sgd",
			"sg-001"
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
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		AccountCreateRequest request = new AccountCreateRequest(
			"clt_2",
			AccountType.Checking,
			AccountStatus.Active,
			LocalDate.parse("2026-02-01"),
			new BigDecimal("100.00"),
			"SGD",
			"SG-001"
		);
		when(clientRepository.findById(2L)).thenReturn(Optional.of(client(2L, "usr_other")));

		assertThatThrownBy(() -> accountService.createAccount(user, request, "Bearer x", "req-1"))
			.isInstanceOf(ClientNotFoundException.class);
		verify(accountRepository, never()).save(any());
	}

	@Test
	void getAccount_agentCannotAccessOtherOwner_throwsAccountNotFound() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		AccountEntity entity = account(5L, client(1L, "usr_other"));
		when(accountRepository.findById(5L)).thenReturn(Optional.of(entity));

		assertThatThrownBy(() -> accountService.getAccount(user, "acc_5"))
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

		ArgumentCaptor<AccountEntity> savedCaptor = ArgumentCaptor.forClass(AccountEntity.class);
		verify(accountRepository).save(savedCaptor.capture());
		assertThat(savedCaptor.getValue().isDeleted()).isTrue();
	}

	@Test
	void updateAccount_changesStatusAndPublishesAuditWithBeforeAfter() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_admin", "admin");
		AccountEntity existing = account(10L, client(1L, "usr_1"));
		when(accountRepository.findById(10L)).thenReturn(Optional.of(existing));
		when(accountRepository.save(any(AccountEntity.class))).thenAnswer(inv -> inv.getArgument(0));

		AccountUpdateRequest request = new AccountUpdateRequest(null, AccountStatus.Inactive, null);
		AccountDto updated = accountService.updateAccount(admin, "acc_10", request, "Bearer x", "req-u");

		assertThat(updated.accountStatus()).isEqualTo(AccountStatus.Inactive);
		verify(auditLogger).logAuditEvent(
			eq("UPDATE"),
			eq("accountStatus"),
			eq("Active"),
			eq("Inactive"),
			eq("usr_admin"),
			eq("clt_1"),
			eq("req-u"),
			eq("Bearer x")
		);
	}

	@Test
	void updateAccount_multipleFieldChanges_pipeDelimitedAudit() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_admin", "admin");
		AccountEntity existing = account(10L, client(1L, "usr_1"));
		when(accountRepository.findById(10L)).thenReturn(Optional.of(existing));
		when(accountRepository.save(any(AccountEntity.class))).thenAnswer(inv -> inv.getArgument(0));

		AccountUpdateRequest request = new AccountUpdateRequest(
			AccountType.Business, AccountStatus.Pending, "SG-002"
		);
		AccountDto updated = accountService.updateAccount(admin, "acc_10", request, "Bearer x", "req-u");

		assertThat(updated.accountType()).isEqualTo(AccountType.Business);
		assertThat(updated.accountStatus()).isEqualTo(AccountStatus.Pending);
		assertThat(updated.branchId()).isEqualTo("SG-002");
		verify(auditLogger).logAuditEvent(
			eq("UPDATE"),
			eq("accountType|accountStatus|branchId"),
			eq("Savings|Active|SG-001"),
			eq("Business|Pending|SG-002"),
			eq("usr_admin"),
			eq("clt_1"),
			eq("req-u"),
			eq("Bearer x")
		);
	}

	@Test
	void updateAccount_noFieldsChanged_skipsAuditLogging() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_admin", "admin");
		AccountEntity existing = account(10L, client(1L, "usr_1"));
		when(accountRepository.findById(10L)).thenReturn(Optional.of(existing));
		when(accountRepository.save(any(AccountEntity.class))).thenAnswer(inv -> inv.getArgument(0));

		AccountUpdateRequest request = new AccountUpdateRequest(null, null, null);
		accountService.updateAccount(admin, "acc_10", request, "Bearer x", "req-u");

		verify(auditLogger, never()).logAuditEvent(any(), any(), any(), any(), any(), any(), any(), any());
	}

	@Test
	void updateAccount_sameValues_skipsAuditLogging() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_admin", "admin");
		AccountEntity existing = account(10L, client(1L, "usr_1"));
		when(accountRepository.findById(10L)).thenReturn(Optional.of(existing));
		when(accountRepository.save(any(AccountEntity.class))).thenAnswer(inv -> inv.getArgument(0));

		AccountUpdateRequest request = new AccountUpdateRequest(AccountType.Savings, AccountStatus.Active, "SG-001");
		accountService.updateAccount(admin, "acc_10", request, "Bearer x", "req-u");

		verify(auditLogger, never()).logAuditEvent(any(), any(), any(), any(), any(), any(), any(), any());
	}

	@Test
	void updateAccount_agentOnUnownedAccount_throwsAccountNotFound() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		AccountEntity existing = account(10L, client(1L, "usr_other"));
		when(accountRepository.findById(10L)).thenReturn(Optional.of(existing));

		AccountUpdateRequest request = new AccountUpdateRequest(null, AccountStatus.Inactive, null);
		assertThatThrownBy(() -> accountService.updateAccount(user, "acc_10", request, "Bearer x", "req-u"))
			.isInstanceOf(AccountNotFoundException.class);
		verify(accountRepository, never()).save(any());
	}

	@Test
	void listAccounts_paginationClipsResults() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_admin", "admin");
		ClientEntity client = client(3L, "usr_3");
		when(clientRepository.findById(3L)).thenReturn(Optional.of(client));
		when(accountRepository.findByClientId(3L)).thenReturn(List.of(
			account(11L, client),
			account(12L, client),
			account(13L, client)
		));

		var response = accountService.listAccounts(admin, "clt_3", 2, 0);

		assertThat(response.data()).hasSize(2);
		assertThat(response.pagination().total()).isEqualTo(3);
		assertThat(response.pagination().limit()).isEqualTo(2);
	}

	@Test
	void listAccounts_offsetSkipsResults() {
		AuthenticatedUser admin = new AuthenticatedUser("usr_admin", "admin");
		ClientEntity client = client(3L, "usr_3");
		when(clientRepository.findById(3L)).thenReturn(Optional.of(client));
		when(accountRepository.findByClientId(3L)).thenReturn(List.of(
			account(11L, client),
			account(12L, client),
			account(13L, client)
		));

		var response = accountService.listAccounts(admin, "clt_3", 50, 2);

		assertThat(response.data()).hasSize(1);
		assertThat(response.data().get(0).accountId()).isEqualTo("acc_13");
		assertThat(response.pagination().offset()).isEqualTo(2);
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

		var response = accountService.listAccounts(admin, "clt_3", 50, 0);

		assertThat(response.data()).hasSize(2);
		assertThat(response.data().get(0).accountId()).isEqualTo("acc_11");
		assertThat(response.data().get(1).accountId()).isEqualTo("acc_12");
		assertThat(response.pagination().total()).isEqualTo(2);
	}

	@Test
	void createAccount_rejectsUnverifiedClient() {
		AppProperties strictPolicy = new AppProperties();
		strictPolicy.getAccountOpening().setRequireVerifiedClient(true);
		accountService = new AccountServiceImpl(accountRepository, clientRepository, auditLogger, strictPolicy);

		AuthenticatedUser admin = new AuthenticatedUser("usr_admin", "admin");
		AccountCreateRequest request = new AccountCreateRequest(
			"clt_1",
			AccountType.Savings,
			AccountStatus.Active,
			LocalDate.parse("2026-02-01"),
			new BigDecimal("500.00"),
			"SGD",
			"SG-001"
		);
		ClientEntity client = client(1L, "usr_owner");
		client.setIdentityVerificationStatus(IdentityVerificationStatus.pending);
		when(clientRepository.findById(1L)).thenReturn(Optional.of(client));

		assertThatThrownBy(() -> accountService.createAccount(admin, request, "Bearer x", "req-1"))
			.isInstanceOf(IllegalArgumentException.class)
			.hasMessageContaining("verified");
		verify(accountRepository, never()).save(any());
	}

	@Test
	void getAccountOpeningOptions_userGetsSingleHomeBranch() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		ClientEntity client = client(1L, "usr_1");
		when(clientRepository.findById(1L)).thenReturn(Optional.of(client));

		AccountOpeningOptionsDto options = accountService.getAccountOpeningOptions(user, "clt_1");

		assertThat(options.canOverrideBranch()).isFalse();
		assertThat(options.authorizedBranches()).containsExactly("SG-001");
		assertThat(options.allowedCurrencies()).contains("SGD", "USD");
	}

	private ClientEntity client(Long id, String assignedUserId) {
		ClientEntity entity = new ClientEntity();
		entity.setId(id);
		entity.setAssignedAgentId(assignedUserId);
		entity.setIdentityVerificationStatus(IdentityVerificationStatus.verified);
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
		entity.setCurrency("SGD");
		entity.setBranchId("SG-001");
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
