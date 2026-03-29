"""Compatibility module for the direct Lambda runtime.

The service routes API Gateway
proxy events directly through ``app.lambda_router.LambdaRouter``.
"""

from .lambda_router import LambdaRouter

__all__ = ["LambdaRouter"]
