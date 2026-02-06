package com.itsa.crm.userservice.util;

public final class IdCodec {
	private IdCodec() {}

	public static String encode(String prefix, long id) {
		return prefix + id;
	}

	public static long decode(String prefix, String value) {
		if (value == null || !value.startsWith(prefix)) {
			throw new IllegalArgumentException("invalid id");
		}
		String suffix = value.substring(prefix.length());
		return Long.parseLong(suffix);
	}
}

