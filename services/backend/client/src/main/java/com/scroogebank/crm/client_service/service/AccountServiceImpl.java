package com.scroogebank.crm.client_service.service;

import com.scroogebank.crm.client_service.api.Pagination;
import com.scroogebank.crm.client_service.config.AppProperties;
import com.scroogebank.crm.client_service.dto.AccountCreateRequest;
import com.scroogebank.crm.client_service.dto.AccountDto;
import com.scroogebank.crm.client_service.dto.AccountListResponse;
import com.scroogebank.crm.client_service.dto.AccountOpeningOptionsDto;
import com.scroogebank.crm.client_service.dto.AccountType;
import com.scroogebank.crm.client_service.dto.AccountUpdateRequest;
import com.scroogebank.crm.client_service.dto.IdentityVerificationStatus;
import com.scroogebank.crm.client_service.entity.AccountEntity;
import com.scroogebank.crm.client_service.entity.ClientEntity;
import com.scroogebank.crm.client_service.exception.AccountNotFoundException;
import com.scroogebank.crm.client_service.exception.AccountOpeningNotAllowedException;
import com.scroogebank.crm.client_service.exception.ClientNotFoundException;
import com.scroogebank.crm.client_service.logging.ClientAuditLogger;
import com.scroogebank.crm.client_service.logging.PiiMasker;
import com.scroogebank.crm.client_service.repository.AccountRepository;
import com.scroogebank.crm.client_service.repository.ClientRepository;
import com.scroogebank.crm.client_service.security.AuthenticatedUser;
import com.scroogebank.crm.client_service.util.IdCodec;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
	private final AppProperties appProperties;
	private final Clock clock;

	public AccountServiceImpl(
		AccountRepository accountRepository,
		ClientRepository clientRepository,
		ClientAuditLogger auditLogger,
		AppProperties appProperties,
		Clock clock
	) {
		this.accountRepository = accountRepository;
		this.clientRepository = clientRepository;
		this.auditLogger = auditLogger;
		this.appProperties = appProperties;
		this.clock = clock;
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
		enforceVerifiedClient(client);
		String normalizedCurrency = normalizeCurrency(request.currency());
		String normalizedBranchId = normalizeBranchId(request.branchId());
		validateBranchAccess(user, normalizedBranchId);
		validateCurrencyPolicy(normalizedBranchId, request.accountType(), normalizedCurrency);

		AccountEntity entity = new AccountEntity();
		entity.setClient(client);
		entity.setAccountType(request.accountType());
		entity.setAccountStatus(request.accountStatus());
		entity.setOpeningDate(LocalDate.now(clock));
		entity.setInitialDeposit(request.initialDeposit());
		entity.setCurrency(normalizedCurrency);
		entity.setBranchId(normalizedBranchId);

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
		if (request.branchId() != null) {
			String normalizedBranchId = normalizeBranchId(request.branchId());
			if (normalizedBranchId.equals(entity.getBranchId())) {
				// no-op after normalization
			}
			else {
				validateBranchAccess(user, normalizedBranchId);
				collectChange(attrs, befores, afters, "branchId",
					entity.getBranchId(), normalizedBranchId);
				entity.setBranchId(normalizedBranchId);
			}
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
		entity.setDeleted(true);
		accountRepository.save(entity);

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

	@Override
	public AccountOpeningOptionsDto getAccountOpeningOptions(AuthenticatedUser user, String clientId) {
		ClientEntity client = loadOwnedClient(user, clientId);
		String resolvedDefaultBranch = resolveDefaultBranchForUser(user);
		List<String> branches = resolveAuthorizedBranches(user);
		Map<String, List<String>> branchCurrencyMap = new LinkedHashMap<>();
		for (String branch : branches) {
			branchCurrencyMap.put(branch, resolveBranchAllowedCurrencies(branch));
		}
		Map<String, List<String>> byAccountType = new LinkedHashMap<>();
		for (Map.Entry<String, Set<String>> entry : appProperties.getAccountOpening().getCurrencyPolicyByAccountType().entrySet()) {
			byAccountType.put(entry.getKey(), sortedList(entry.getValue()));
		}
		return new AccountOpeningOptionsDto(
			clientId(client.getId()),
			resolvedDefaultBranch,
			user.isAdmin() && appProperties.getAccountOpening().isAdminCanOverrideBranch(),
			branches,
			sortedList(appProperties.getAccountOpening().getAllowedCurrencies()),
			branchCurrencyMap,
			byAccountType
		);
	}

	private void collectChange(
		StringJoiner attrs, StringJoiner befores, StringJoiner afters,
		String fieldName, String oldValue, String newValue
	) {
		attrs.add(fieldName);
		befores.add(oldValue != null ? PiiMasker.mask(fieldName, oldValue) : "");
		afters.add(PiiMasker.mask(fieldName, newValue));
	}

	private void enforceVerifiedClient(ClientEntity client) {
		if (!appProperties.getAccountOpening().isRequireVerifiedClient()) {
			return;
		}
		IdentityVerificationStatus status = client.getIdentityVerificationStatus();
		if (status != IdentityVerificationStatus.verified) {
			String statusText = status == null ? IdentityVerificationStatus.unverified.name() : status.name();
			throw new AccountOpeningNotAllowedException(
				"Client is " + statusText + ", not allowed to create account"
			);
		}
	}

	private void validateBranchAccess(AuthenticatedUser user, String branchId) {
		List<String> activeBranches = normalizedActiveBranches();
		if (!activeBranches.contains(branchId)) {
			throw new IllegalArgumentException("Unknown or inactive branchId: " + branchId);
		}
		if (user.isAdmin()) {
			if (appProperties.getAccountOpening().isAdminCanOverrideBranch()) {
				return;
			}
			String defaultBranch = resolveDefaultBranchForUser(user);
			if (!branchId.equals(defaultBranch)) {
				throw new IllegalArgumentException("Branch override is not allowed");
			}
			return;
		}
		String userBranch = resolveDefaultBranchForUser(user);
		if (!branchId.equals(userBranch)) {
			throw new IllegalArgumentException("Branch override is only allowed for admins");
		}
	}

	private void validateCurrencyPolicy(String branchId, AccountType accountType, String currency) {
		Set<String> global = normalizedSet(appProperties.getAccountOpening().getAllowedCurrencies());
		if (!global.contains(currency)) {
			throw new IllegalArgumentException("Unsupported currency: " + currency);
		}
		Set<String> byBranch = normalizedSet(appProperties.getAccountOpening().getBranchAllowedCurrencies().getOrDefault(branchId, Set.of()));
		if (!byBranch.isEmpty() && !byBranch.contains(currency)) {
			throw new IllegalArgumentException("Currency " + currency + " is not allowed for branch " + branchId);
		}
		Set<String> byType = normalizedSet(
			appProperties.getAccountOpening().getCurrencyPolicyByAccountType().getOrDefault(accountType.name(), Set.of())
		);
		if (!byType.isEmpty() && !byType.contains(currency)) {
			throw new IllegalArgumentException("Currency " + currency + " is not allowed for account type " + accountType.name());
		}
	}

	private String normalizeCurrency(String currency) {
		return normalizeUpper(currency);
	}

	private String normalizeBranchId(String branchId) {
		return normalizeUpper(branchId);
	}

	private static String normalizeUpper(String value) {
		if (value == null) {
			return null;
		}
		return value.trim().toUpperCase();
	}

	private String resolveDefaultBranchForUser(AuthenticatedUser user) {
		Map<String, String> byUser = appProperties.getAccountOpening().getUserHomeBranchByUserId();
		String configured = byUser.get(user.userId());
		String branch = normalizeUpper(configured == null ? appProperties.getAccountOpening().getDefaultUserBranch() : configured);
		if (branch == null || branch.isBlank()) {
			throw new IllegalStateException("Account opening branch policy is misconfigured: defaultUserBranch is blank");
		}
		if (!normalizedActiveBranches().contains(branch)) {
			throw new IllegalStateException("Account opening branch policy is misconfigured: default/home branch is inactive");
		}
		return branch;
	}

	private List<String> resolveAuthorizedBranches(AuthenticatedUser user) {
		if (user.isAdmin() && appProperties.getAccountOpening().isAdminCanOverrideBranch()) {
			return normalizedActiveBranches();
		}
		return List.of(resolveDefaultBranchForUser(user));
	}

	private List<String> resolveBranchAllowedCurrencies(String branchId) {
		Set<String> global = normalizedSet(appProperties.getAccountOpening().getAllowedCurrencies());
		Set<String> byBranch = normalizedSet(appProperties.getAccountOpening().getBranchAllowedCurrencies().getOrDefault(branchId, Set.of()));
		if (byBranch.isEmpty()) {
			return sortedList(global);
		}
		Set<String> intersection = new LinkedHashSet<>(global);
		intersection.retainAll(byBranch);
		return sortedList(intersection);
	}

	private List<String> normalizedActiveBranches() {
		return sortedList(appProperties.getAccountOpening().getActiveBranches());
	}

	private static Set<String> normalizedSet(Set<String> input) {
		Set<String> normalized = new LinkedHashSet<>();
		if (input == null) {
			return normalized;
		}
		for (String value : input) {
			String cleaned = normalizeUpper(value);
			if (cleaned != null && !cleaned.isBlank()) {
				normalized.add(cleaned);
			}
		}
		return normalized;
	}

	private static List<String> sortedList(Set<String> input) {
		List<String> list = new ArrayList<>(normalizedSet(input));
		list.sort(String::compareTo);
		return list;
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

		if (entity.isDeleted()) {
			throw new AccountNotFoundException(accountId);
		}

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
		String userId, String clientId, String correlationId, String authorizationHeader
	) {
		if (authorizationHeader == null || authorizationHeader.isBlank()) {
			return;
		}
		try {
			auditLogger.logAuditEvent(
				action, attributeName, beforeValue, afterValue,
				userId, clientId, correlationId, authorizationHeader
			);
		}
		catch (Exception ex) {
			LOGGER.warn("Account operation completed but audit logging failed. action={} clientId={}",
				action, clientId, ex);
		}
	}
}
