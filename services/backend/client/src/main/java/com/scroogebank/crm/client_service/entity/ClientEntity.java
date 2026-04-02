package com.scroogebank.crm.client_service.entity;

import java.time.Instant;
import java.time.LocalDate;

import com.scroogebank.crm.client_service.crypto.EncryptedStringConverter;
import com.scroogebank.crm.client_service.dto.IdentityVerificationStatus;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
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

/**
 * JPA entity representing a client profile and verification state.
 */
@Entity
@Table(
	name = "clients",
	uniqueConstraints = {
		@UniqueConstraint(name = "uk_clients_email", columnNames = "email_address"),
		@UniqueConstraint(name = "uk_clients_phone", columnNames = "phone_number")
	}
)
public class ClientEntity {
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "client_id")
	private Long id;

	@Column(name = "first_name", nullable = false, length = 50)
	private String firstName;

	@Column(name = "last_name", nullable = false, length = 50)
	private String lastName;

	@Column(name = "date_of_birth", nullable = false)
	private LocalDate dateOfBirth;

	@Enumerated(EnumType.STRING)
	@Column(name = "gender", nullable = false, length = 20)
	private Gender gender;

	@Column(name = "email_address", nullable = false, length = 255)
	private String emailAddress;

	@Column(name = "phone_number", nullable = false, length = 20)
	private String phoneNumber;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "address", nullable = false, length = 512)
	private String address;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "city", nullable = false, length = 512)
	private String city;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "state", nullable = false, length = 512)
	private String state;

	@Column(name = "country", nullable = false, length = 50)
	private String country;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "postal_code", nullable = false, length = 512)
	private String postalCode;

	@Column(name = "assigned_user_id", nullable = false, length = 64)
	private String assignedUserId;

	@Enumerated(EnumType.STRING)
	@Column(name = "identity_verification_status", nullable = false, length = 20)
	private IdentityVerificationStatus identityVerificationStatus = IdentityVerificationStatus.unverified;

	// Primary identity document
	@Column(name = "primary_document_type", length = 20)
	private String primaryDocumentType;

	@Column(name = "primary_document_ref", length = 255)
	private String primaryDocumentRef;

	// Proof of address document
	@Column(name = "address_document_type", length = 20)
	private String addressDocumentType;

	@Column(name = "address_document_ref", length = 255)
	private String addressDocumentRef;

	@Column(name = "verification_verified_at")
	private Instant verificationVerifiedAt;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	@Column(name = "deleted", nullable = false)
	private boolean deleted = false;

	/**
	 * Initializes timestamps and default verification status before persistence.
	 */
	@PrePersist
	void prePersist() {
		Instant now = Instant.now();
		createdAt = now;
		updatedAt = now;
		if (identityVerificationStatus == null) {
			identityVerificationStatus = IdentityVerificationStatus.unverified;
		}
	}

	/**
	 * Updates the modification timestamp before update.
	 */
	@PreUpdate
	void preUpdate() {
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

	public LocalDate getDateOfBirth() {
		return dateOfBirth;
	}

	public void setDateOfBirth(LocalDate dateOfBirth) {
		this.dateOfBirth = dateOfBirth;
	}

	public Gender getGender() {
		return gender;
	}

	public void setGender(Gender gender) {
		this.gender = gender;
	}

	public String getEmailAddress() {
		return emailAddress;
	}

	public void setEmailAddress(String emailAddress) {
		this.emailAddress = emailAddress;
	}

	public String getPhoneNumber() {
		return phoneNumber;
	}

	public void setPhoneNumber(String phoneNumber) {
		this.phoneNumber = phoneNumber;
	}

	public String getAddress() {
		return address;
	}

	public void setAddress(String address) {
		this.address = address;
	}

	public String getCity() {
		return city;
	}

	public void setCity(String city) {
		this.city = city;
	}

	public String getState() {
		return state;
	}

	public void setState(String state) {
		this.state = state;
	}

	public String getCountry() {
		return country;
	}

	public void setCountry(String country) {
		this.country = country;
	}

	public String getPostalCode() {
		return postalCode;
	}

	public void setPostalCode(String postalCode) {
		this.postalCode = postalCode;
	}

	public String getAssignedAgentId() {
		return assignedUserId;
	}

	public void setAssignedAgentId(String assignedUserId) {
		this.assignedUserId = assignedUserId;
	}

	public IdentityVerificationStatus getIdentityVerificationStatus() {
		return identityVerificationStatus;
	}

	public void setIdentityVerificationStatus(IdentityVerificationStatus identityVerificationStatus) {
		this.identityVerificationStatus = identityVerificationStatus;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}

	public String getPrimaryDocumentType() {
		return primaryDocumentType;
	}

	public void setPrimaryDocumentType(String primaryDocumentType) {
		this.primaryDocumentType = primaryDocumentType;
	}

	public String getPrimaryDocumentRef() {
		return primaryDocumentRef;
	}

	public void setPrimaryDocumentRef(String primaryDocumentRef) {
		this.primaryDocumentRef = primaryDocumentRef;
	}

	public String getAddressDocumentType() {
		return addressDocumentType;
	}

	public void setAddressDocumentType(String addressDocumentType) {
		this.addressDocumentType = addressDocumentType;
	}

	public String getAddressDocumentRef() {
		return addressDocumentRef;
	}

	public void setAddressDocumentRef(String addressDocumentRef) {
		this.addressDocumentRef = addressDocumentRef;
	}

	public Instant getVerificationVerifiedAt() {
		return verificationVerifiedAt;
	}

	public void setVerificationVerifiedAt(Instant verificationVerifiedAt) {
		this.verificationVerifiedAt = verificationVerifiedAt;
	}

	public boolean isDeleted() { return deleted; }
	public void setDeleted(boolean deleted) { this.deleted = deleted; }
}
