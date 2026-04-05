package com.scroogebank.crm.client_service.dto;

/**
 * Lifecycle status values for a client record.
 *
 * <ul>
 *   <li>{@code active} – default state, client relationship is active</li>
 *   <li>{@code inactive} – explicitly deactivated but retained for follow-up</li>
 *   <li>{@code closed} – relationship ended, retained for audit/compliance</li>
 * </ul>
 */
public enum ClientStatus {
	active,
	inactive,
	closed
}
