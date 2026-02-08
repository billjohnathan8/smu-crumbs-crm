package com.scroogebank.crm.transaction_service.dto;

import com.scroogebank.crm.transaction_service.api.Pagination;
import java.util.List;

/**
 * Response payload for transaction list endpoints.
 */
public record TransactionsListResponse(
	List<TransactionDto> data,
	Pagination pagination
) {}

