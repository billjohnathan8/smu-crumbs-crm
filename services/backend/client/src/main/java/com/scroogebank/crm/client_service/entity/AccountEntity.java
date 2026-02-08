package com.scroogebank.crm.client_service.entity;

import com.scroogebank.crm.client_service.dto.AccountStatus;
import com.scroogebank.crm.client_service.dto.AccountType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/**
 * JPA entity representing a client account.
 */
@Entity
@Table(name = "accounts")
public class AccountEntity {
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "account_id")
	private Long id;

	@ManyToOne(optional = false)
	@JoinColumn(name = "client_id", nullable = false)
	private ClientEntity client;

	@Enumerated(EnumType.STRING)
	@Column(name = "account_type", nullable = false, length = 20)
	private AccountType accountType;

	@Enumerated(EnumType.STRING)
	@Column(name = "account_status", nullable = false, length = 20)
	private AccountStatus accountStatus;

	@Column(name = "opening_date", nullable = false)
	private LocalDate openingDate;

	@Column(name = "initial_deposit", nullable = false, precision = 18, scale = 2)
	private BigDecimal initialDeposit;

	@Column(name = "currency", nullable = false, length = 10)
	private String currency;

	@Column(name = "branch_id", nullable = false, length = 40)
	private String branchId;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	/**
	 * Initializes creation timestamp before persistence.
	 */
	@PrePersist
	void prePersist() {
		createdAt = Instant.now();
	}

	public Long getId() {
		return id;
	}

	public ClientEntity getClient() {
		return client;
	}

	public void setClient(ClientEntity client) {
		this.client = client;
	}

	public AccountType getAccountType() {
		return accountType;
	}

	public void setAccountType(AccountType accountType) {
		this.accountType = accountType;
	}

	public AccountStatus getAccountStatus() {
		return accountStatus;
	}

	public void setAccountStatus(AccountStatus accountStatus) {
		this.accountStatus = accountStatus;
	}

	public LocalDate getOpeningDate() {
		return openingDate;
	}

	public void setOpeningDate(LocalDate openingDate) {
		this.openingDate = openingDate;
	}

	public BigDecimal getInitialDeposit() {
		return initialDeposit;
	}

	public void setInitialDeposit(BigDecimal initialDeposit) {
		this.initialDeposit = initialDeposit;
	}

	public String getCurrency() {
		return currency;
	}

	public void setCurrency(String currency) {
		this.currency = currency;
	}

	public String getBranchId() {
		return branchId;
	}

	public void setBranchId(String branchId) {
		this.branchId = branchId;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}
}
