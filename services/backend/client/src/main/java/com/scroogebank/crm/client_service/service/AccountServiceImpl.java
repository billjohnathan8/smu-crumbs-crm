package com.scroogebank.crm.client_service.service;

import com.scroogebank.crm.client_service.api.Pagination;
import com.scroogebank.crm.client_service.dto.AccountCreateRequest;
import com.scroogebank.crm.client_service.dto.AccountDto;
import com.scroogebank.crm.client_service.dto.AccountListResponse;
import com.scroogebank.crm.client_service.dto.AccountUpdateRequest;
import com.scroogebank.crm.client_service.entity.AccountEntity;
import com.scroogebank.crm.client_service.entity.ClientEntity;
import com.scroogebank.crm.client_service.exception.AccountNotFoundException;
import com.scroogebank.crm.client_service.exception.ClientNotFoundException;
import com.scroogebank.crm.client_service.logging.ClientAuditLogger;
import com.scroogebank.crm.client_service.repository.AccountRepository;
import com.scroogebank.crm.client_service.repository.ClientRepository;
import com.scroogebank.crm.client_service.security.AuthenticatedUser;
import com.scroogebank.crm.client_service.util.IdCodec;
import java.util.List;
import java.util.StringJoiner;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Default account service implementation with ownership checks and audit logging.
 */
@Service
public class AccountServiceImpl implements AccountService {
	private static final Logger LOGGER = LoggerFactory.getLogger(AccountServiceImpl.class);
	private static final String CLIENT_ID_PREFIX = "clt_";
	private static final String ACCOUNT_ID_PREFIX = "acc_";

	private final AccountRepository accountRepository;
	private final ClientRepository clientRepository;
	private final ClientAuditLogger auditLogger;

	public AccountServiceImpl(
		AccountRepository accountRepository,
		ClientRepository clientRepository,
		ClientAuditLogger auditLogger
	) {
		this.accountRepository = accountRepository;
		this.clientRepository = clientRepository;
		this.auditLogger = auditLogger;
	}

	@Override
	@Transactional
	public AccountDto createAccount(
		AuthenticatedUser user,
		AccountCreateRequest request,
		String authorizationHeader,
		String requestId
	) {
		ClientEntity client = loadOwnedClient(user, request.clientId());

		AccountEntity entity = new AccountEntity();
		entity.setClient(client);
		entity.setAccountType(request.accountType());
		entity.setAccountStatus(request.accountStatus());
		entity.setOpeningDate(request.openingDate());
		entity.setInitialDeposit(request.initialDeposit());
		entity.setCurrency(request.currency());
		entity.setBranchId(request.branchId());

		AccountEntity saved = accountRepository.save(entity);

		String apiAccountId = accountId(saved.getId());
		publishAuditSafe(
			"CREATE", "Account ID", null, apiAccountId,
			user.userId(), clientId(client.getId()), requestId, authorizationHeader
		);

		return toDto(saved);
	}

	@Override
	public AccountDto getAccount(AuthenticatedUser user, String accountId) {
		AccountEntity entity = loadOwnedAccount(user, accountId);
		return toDto(entity);
	}

	@Override
	@Transactional
	public AccountDto updateAccount(
		AuthenticatedUser user,
		String accountId,
		AccountUpdateRequest request,
		String authorizationHeader,
		String requestId
	) {
		AccountEntity entity = loadOwnedAccount(user, accountId);
		String cltId = clientId(entity.getClient().getId());

		StringJoiner attrs = new StringJoiner("|");
		StringJoiner befores = new StringJoiner("|");
		StringJoiner afters = new StringJoiner("|");

		if (request.accountType() != null && request.accountType() != entity.getAccountType()) {
			collectChange(attrs, befores, afters, "accountType",
				entity.getAccountType().name(), request.accountType().name());
			entity.setAccountType(request.accountType());
		}
		if (request.accountStatus() != null && request.accountStatus() != entity.getAccountStatus()) {
			collectChange(attrs, befores, afters, "accountStatus",
				entity.getAccountStatus().name(), request.accountStatus().name());
			entity.setAccountStatus(request.accountStatus());
		}
		if (request.branchId() != null && !request.branchId().equals(entity.getBranchId())) {
			collectChange(attrs, befores, afters, "branchId",
				entity.getBranchId(), request.branchId());
			entity.setBranchId(request.branchId());
		}

		AccountEntity saved = accountRepository.save(entity);

		String attrString = attrs.toString();
		if (!attrString.isEmpty()) {
			publishAuditSafe(
				"UPDATE", attrString, befores.toString(), afters.toString(),
				user.userId(), cltId, requestId, authorizationHeader
			);
		}

		return toDto(saved);
	}

	@Override
	@Transactional
	public void deleteAccount(
		AuthenticatedUser user,
		String accountId,
		String authorizationHeader,
		String requestId
	) {
		AccountEntity entity = loadOwnedAccount(user, accountId);
		String cltId = clientId(entity.getClient().getId());
		accountRepository.delete(entity);

		publishAuditSafe(
			"DELETE", "Account ID", accountId, null,
			user.userId(), cltId, requestId, authorizationHeader
		);
	}

	@Override
	public AccountListResponse listAccounts(AuthenticatedUser user, String clientId, int limit, int offset) {
		ClientEntity client = loadOwnedClient(user, clientId);
		List<AccountEntity> all = accountRepository.findByClientId(client.getId());

		int normalizedLimit = Math.max(1, Math.min(200, limit));
		int normalizedOffset = Math.max(0, offset);
		long total = all.size();
		int fromIndex = Math.min(normalizedOffset, all.size());
		int toIndex = Math.min(fromIndex + normalizedLimit, all.size());

		List<AccountDto> data = all.subList(fromIndex, toIndex).stream().map(this::toDto).toList();
		return new AccountListResponse(data, new Pagination(normalizedLimit, normalizedOffset, total));
	}

	private void collectChange(
		StringJoiner attrs, StringJoiner befores, StringJoiner afters,
		String fieldName, String oldValue, String newValue
	) {
		attrs.add(fieldName);
		befores.add(oldValue != null ? oldValue : "");
		afters.add(newValue);
	}

	private AccountDto toDto(AccountEntity entity) {
		return new AccountDto(
			accountId(entity.getId()),
			clientId(entity.getClient().getId()),
			entity.getAccountType(),
			entity.getAccountStatus(),
			entity.getOpeningDate(),
			entity.getInitialDeposit(),
			entity.getCurrency(),
			entity.getBranchId(),
			entity.getCreatedAt(),
			entity.getUpdatedAt()
		);
	}

	private ClientEntity loadOwnedClient(AuthenticatedUser user, String clientId) {
		long dbClientId = decodeClientId(clientId);
		ClientEntity client = clientRepository.findById(dbClientId)
			.orElseThrow(() -> new ClientNotFoundException(clientId));
		if (!user.isAdmin() && !user.userId().equals(client.getAssignedAgentId())) {
			throw new ClientNotFoundException(clientId);
		}
		return client;
	}

	private AccountEntity loadOwnedAccount(AuthenticatedUser user, String accountId) {
		long dbAccountId = decodeAccountId(accountId);
		AccountEntity entity = accountRepository.findById(dbAccountId)
			.orElseThrow(() -> new AccountNotFoundException(accountId));
		ClientEntity client = entity.getClient();
		if (!user.isAdmin() && !user.userId().equals(client.getAssignedAgentId())) {
			throw new AccountNotFoundException(accountId);
		}
		return entity;
	}

	private long decodeClientId(String clientId) {
		return IdCodec.decode(CLIENT_ID_PREFIX, clientId);
	}

	private long decodeAccountId(String accountId) {
		return IdCodec.decode(ACCOUNT_ID_PREFIX, accountId);
	}

	private String clientId(long dbId) {
		return IdCodec.encode(CLIENT_ID_PREFIX, dbId);
	}

	private String accountId(long dbId) {
		return IdCodec.encode(ACCOUNT_ID_PREFIX, dbId);
	}

	private void publishAuditSafe(
		String action, String attributeName, String beforeValue, String afterValue,
		String agentId, String clientId, String correlationId, String authorizationHeader
	) {
		if (authorizationHeader == null || authorizationHeader.isBlank()) {
			return;
		}
		try {
			auditLogger.logAuditEvent(
				action, attributeName, beforeValue, afterValue,
				agentId, clientId, correlationId, authorizationHeader
			);
		}
		catch (Exception ex) {
			LOGGER.warn("Account operation completed but audit logging failed. action={} clientId={}",
				action, clientId, ex);
		}
	}
}
