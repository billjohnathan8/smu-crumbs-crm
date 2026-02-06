package com.itsa.crm.transactions_service.dto;

import com.itsa.crm.transactions_service.api.Pagination;
import java.util.List;

public record TransactionsListResponse(
	List<TransactionDto> data,
	Pagination pagination
) {}

