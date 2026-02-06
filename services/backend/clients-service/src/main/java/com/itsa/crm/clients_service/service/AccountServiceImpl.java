package com.itsa.crm.clients_service.service;

import com.itsa.crm.clients_service.dto.AccountCreateRequest;
import com.itsa.crm.clients_service.dto.AccountDto;
import com.itsa.crm.clients_service.entity.AccountEntity;
import com.itsa.crm.clients_service.entity.ClientEntity;
import com.itsa.crm.clients_service.exception.AccountNotFoundException;
import com.itsa.crm.clients_service.exception.ClientNotFoundException;
import com.itsa.crm.clients_service.logging.ClientAuditLogger;
import com.itsa.crm.clients_service.repository.AccountRepository;
import com.itsa.crm.clients_service.repository.ClientRepository;
import com.itsa.crm.clients_service.security.AuthenticatedUser;
import com.itsa.crm.clients_service.util.IdCodec;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
			"CREATE",
			"Account ID",
			null,
			apiAccountId,
			user.userId(),
			clientId(client.getId()),
			requestId,
			authorizationHeader
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
	public void deleteAccount(
		AuthenticatedUser user,
		String accountId,
		String authorizationHeader,
		String requestId
	) {
		AccountEntity entity = loadOwnedAccount(user, accountId);
		String clientId = clientId(entity.getClient().getId());
		accountRepository.delete(entity);

		publishAuditSafe(
			"DELETE",
			"Account ID",
			accountId,
			null,
			user.userId(),
			clientId,
			requestId,
			authorizationHeader
		);
	}

	@Override
	public List<AccountDto> listAccounts(AuthenticatedUser user, String clientId) {
		ClientEntity client = loadOwnedClient(user, clientId);
		return accountRepository.findByClientId(client.getId()).stream().map(this::toDto).toList();
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
			entity.getCreatedAt()
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
		String action,
		String attributeName,
		String beforeValue,
		String afterValue,
		String agentId,
		String clientId,
		String correlationId,
		String authorizationHeader
	) {
		if (authorizationHeader == null || authorizationHeader.isBlank()) {
			return;
		}
		try {
			auditLogger.logAuditEvent(
				action,
				attributeName,
				beforeValue,
				afterValue,
				agentId,
				clientId,
				correlationId,
				authorizationHeader
			);
		}
		catch (Exception ex) {
			LOGGER.warn("Account operation completed but audit logging failed. action={} clientId={}", action, clientId, ex);
		}
	}
}

