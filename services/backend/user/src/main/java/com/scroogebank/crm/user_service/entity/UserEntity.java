package com.scroogebank.crm.user_service.entity;

import com.scroogebank.crm.user_service.dto.UserRole;
import com.scroogebank.crm.user_service.dto.UserStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;

/**
 * JPA entity for persisted users.
 */
@Entity
@Table(
	name = "users",
	uniqueConstraints = {
		@UniqueConstraint(name = "uk_users_email", columnNames = "email")
	}
)
public class UserEntity {
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "user_id")
	private Long id;

	@Column(name = "first_name", nullable = false, length = 100)
	private String firstName;

	@Column(name = "last_name", nullable = false, length = 100)
	private String lastName;

	@Column(name = "email", nullable = false, length = 320)
	private String email;

	@Enumerated(EnumType.STRING)
	@Column(name = "role", nullable = false, length = 32)
	private UserRole role;

	@Enumerated(EnumType.STRING)
	@Column(name = "status", nullable = false, length = 32)
	private UserStatus status;

	@Column(name = "password_hash", nullable = false, length = 256)
	private String passwordHash;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	@Column(name = "archived_at")
	private Instant archivedAt;

	@Column(name = "archived_by")
	private Long archivedBy;

	@Column(name = "archival_reason", length = 500)
	private String archivalReason;

	@Column(name = "reinstated_at")
	private Instant reinstatedAt;

	@Column(name = "reinstated_by")
	private Long reinstatedBy;

	@PrePersist
	protected void prePersist() {
		Instant now = Instant.now();
		createdAt = now;
		updatedAt = now;
	}

	@PreUpdate
	protected void preUpdate() {
		updatedAt = Instant.now();
	}

	public Long getId() {
		return id;
	}

	public void setId(Long id) {
		this.id = id;
	}

	public String getFirstName() {
		return firstName;
	}

	public void setFirstName(String firstName) {
		this.firstName = firstName;
	}

	public String getLastName() {
		return lastName;
	}

	public void setLastName(String lastName) {
		this.lastName = lastName;
	}

	public String getEmail() {
		return email;
	}

	public void setEmail(String email) {
		this.email = email;
	}

	public UserRole getRole() {
		return role;
	}

	public void setRole(UserRole role) {
		this.role = role;
	}

	public UserStatus getStatus() {
		return status;
	}

	public void setStatus(UserStatus status) {
		this.status = status;
	}

	public String getPasswordHash() {
		return passwordHash;
	}

	public void setPasswordHash(String passwordHash) {
		this.passwordHash = passwordHash;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public void setCreatedAt(Instant createdAt) {
		this.createdAt = createdAt;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}

	public void setUpdatedAt(Instant updatedAt) {
		this.updatedAt = updatedAt;
	}

	public Instant getArchivedAt() {
		return archivedAt;
	}

	public void setArchivedAt(Instant archivedAt) {
		this.archivedAt = archivedAt;
	}

	public Long getArchivedBy() {
		return archivedBy;
	}

	public void setArchivedBy(Long archivedBy) {
		this.archivedBy = archivedBy;
	}

	public String getArchivalReason() {
		return archivalReason;
	}

	public void setArchivalReason(String archivalReason) {
		this.archivalReason = archivalReason;
	}

	public Instant getReinstatedAt() {
		return reinstatedAt;
	}

	public void setReinstatedAt(Instant reinstatedAt) {
		this.reinstatedAt = reinstatedAt;
	}

	public Long getReinstatedBy() {
		return reinstatedBy;
	}

	public void setReinstatedBy(Long reinstatedBy) {
		this.reinstatedBy = reinstatedBy;
	}
}
