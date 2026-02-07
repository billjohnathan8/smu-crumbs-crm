package com.itsa.crm.transaction_service.dto;

import com.itsa.crm.transaction_service.api.Pagination;
import java.util.List;

/**
 * Response payload for transaction list endpoints.
 */
public record TransactionsListResponse(
	List<TransactionDto> data,
	Pagination pagination
) {}

