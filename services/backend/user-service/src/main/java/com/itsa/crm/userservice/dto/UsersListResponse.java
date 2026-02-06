package com.itsa.crm.userservice.dto;

import com.itsa.crm.userservice.api.Pagination;
import java.util.List;

public record UsersListResponse(
	List<UserDto> data,
	Pagination pagination
) {}

