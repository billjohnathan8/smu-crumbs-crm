package com.scroogebank.crm.client_service.dto;

/**
 * Request payload for deleting a client on behalf of an user.
 */
public record ClientDeleteRequest(
	String userId
) {}
