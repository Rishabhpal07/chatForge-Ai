"""S3-compatible object storage access (MinIO locally, R2/S3 in prod)."""
from __future__ import annotations

import boto3
from botocore.config import Config

from app.core.config import get_settings


def _client():
    s = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=s.s3_endpoint,
        region_name=s.s3_region,
        aws_access_key_id=s.s3_access_key_id,
        aws_secret_access_key=s.s3_secret_access_key,
        config=Config(s3={"addressing_style": "path" if s.s3_force_path_style else "auto"}),
    )


def download_bytes(storage_key: str) -> bytes:
    s = get_settings()
    obj = _client().get_object(Bucket=s.s3_bucket, Key=storage_key)
    return obj["Body"].read()


def upload_bytes(storage_key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    s = get_settings()
    _client().put_object(Bucket=s.s3_bucket, Key=storage_key, Body=data, ContentType=content_type)
