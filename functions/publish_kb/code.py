#input_type_name: PublishKbInput
#output_type_name: PublishKbResult
#function_name: publish_kb

import re
from typing import Optional

from pydantic import BaseModel
from lemma_sdk import FunctionContext, Pod


class PublishKbInput(BaseModel):
    ticket_id: Optional[str] = None
    title: str
    slug: str
    body: str


class PublishKbResult(BaseModel):
    path: str


def _safe_slug(slug: str, title: str) -> str:
    base = (slug or title or "article").lower()
    base = re.sub(r"[^a-z0-9]+", "-", base).strip("-")
    return (base or "article")[:60]


async def publish_kb(ctx: FunctionContext, data: PublishKbInput) -> PublishKbResult:
    pod = Pod.from_env()

    slug = _safe_slug(data.slug, data.title)
    local = f"/tmp/{slug}.txt"
    contents = f"{data.title}\n{'=' * len(data.title)}\n\n{data.body.strip()}\n"
    with open(local, "w", encoding="utf-8") as f:
        f.write(contents)

    pod.files.upload(local, directory_path="/knowledge", description=f"KB: {data.title}")
    path = f"/knowledge/{slug}.txt"

    if data.ticket_id:
        pod.table("ticket_events").create({
            "ticket_id": data.ticket_id,
            "kind": "note",
            "actor": "kb-writer",
            "detail": f"Published knowledge article “{data.title}” to {path} — future replies can ground in it.",
        })

    return PublishKbResult(path=path)
