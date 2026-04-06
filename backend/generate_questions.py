import os
import json
import time
import re
from dotenv import load_dotenv
from openai import AzureOpenAI
from azure.storage.blob import BlobServiceClient, ContentSettings

load_dotenv()

from app.dimensions import DIMENSIONS

PERSONAS = [
    {
        "id": "gcc-leadership",
        "title": "GCC Leadership",
        "roles": ["GCC Head", "Managing Director (MD)", "Chief Operating Officer (COO)", "Strategy Officer"],
    },
    {
        "id": "tech-leadership",
        "title": "Technology Leadership",
        "roles": ["CTO/VP Engineering", "Head of IT"],
    },
    {
        "id": "data-leadership",
        "title": "Data Leadership",
        "roles": ["Head of Data", "Chief Data Officer", "Analytics Lead"],
    },
    {
        "id": "ai-ml-practitioners",
        "title": "AI / ML Practitioners",
        "roles": ["Data Scientists", "ML Engineers", "AI CoE"],
    },
    {
        "id": "hr-talent-leadership",
        "title": "HR & Talent Leadership",
        "roles": ["CHRO / VP HR", "Head of L&D", "Talent Acquisition"],
    },
    {
        "id": "function-business-leaders",
        "title": "Function / Business Leaders",
        "roles": ["Head of Finance Ops", "Head of Risk", "Operations Lead"],
    },
    {
        "id": "risk-legal-compliance",
        "title": "Risk, Legal & Compliance",
        "roles": ["General Counsel", "Head of Risk", "Compliance Officer"],
    },
]

SYSTEM_PROMPT = """You are a senior AI maturity assessment consultant designing a professional benchmarking survey for Global Capability Centers (GCCs), similar in style to the EY GCC AI Realized Index.

Given a specific persona and role, generate exactly ONE tailored survey question for each of the 9 GARIX dimensions listed below.

Requirements for each question:
- Professional, consulting-grade language suitable for C-suite and senior leadership
- Specific and relevant to the given persona's responsibilities and perspective
- Designed to benchmark the organization's AI maturity against industry peers
- Phrased as a single, clear assessment question (not multiple sub-questions)
- Focused on measurable outcomes, not opinions
- Vary the question style across dimensions: use a mix of "How well-defined is...", "Does your GCC have...", "Which best describes...", "Where does your organisation stand on...", etc.

Each question MUST have exactly 5 answer options, ordered from lowest maturity (1) to highest maturity (5).
Each option has two parts:
- "label": A short, punchy 2-4 word title (e.g., "Ad hoc experiments", "Strategy drafted", "No risk framework", "Automated monitoring")
- "description": A concise 1-sentence elaboration (e.g., "No strategy. Individual curiosity only. No executive mandate or budget.")

The labels and descriptions must be unique and specific to each question's context. Do NOT use generic labels like "Initial", "Developing", "Defined", "Managed", "Leading".

Return a JSON array with exactly 9 objects, each having:
- "dimension_id": the dimension number (1-9)
- "dimension_name": the dimension name exactly as given
- "question": the tailored question
- "options": array of exactly 5 objects, each with "label" (string) and "description" (string)

Return ONLY the JSON array, no other text."""


def slugify(text: str) -> str:
    """Convert text to a URL/filename-safe slug."""
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    text = re.sub(r"[\s]+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-")


def generate_for_combo(client: AzureOpenAI, deployment: str, persona: str, role: str) -> list[dict]:
    """Generate 9 questions for a given persona+role combo."""
    dimensions_text = "\n".join(
        f"{d['id']}. {d['name']}: {d['key_components']}" for d in DIMENSIONS
    )

    user_prompt = f"""Persona: {persona}
Role: {role}

GARIX Dimensions:
{dimensions_text}

Generate one professionally-worded benchmarking question per dimension, tailored for a {role} within the {persona} function of a GCC."""

    response = client.chat.completions.create(
        model=deployment,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.7,
        max_tokens=2000,
    )

    content = response.choices[0].message.content or ""
    content = content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1] if "\n" in content else content[3:]
    if content.endswith("```"):
        content = content[:-3]
    content = content.strip()

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        # Try fixing common JSON issues: trailing commas
        import re as _re
        fixed = _re.sub(r',\s*([}\]])', r'\1', content)
        return json.loads(fixed)


def get_blob_service() -> BlobServiceClient:
    sas_url = os.getenv("AZURE_STORAGE_SAS_URL")
    if sas_url:
        return BlobServiceClient(account_url=sas_url)
    account_url = os.getenv("AZURE_STORAGE_ACCOUNT_URL")
    from azure.identity import DefaultAzureCredential
    return BlobServiceClient(account_url=account_url, credential=DefaultAzureCredential())


def main():
    import sys
    only_missing = "--only-missing" in sys.argv

    client = AzureOpenAI(
        azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT", ""),
        api_key=os.getenv("AZURE_OPENAI_API_KEY", ""),
        api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-08-01-preview"),
    )
    deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")
    container_name = os.getenv("BLOB_CONTAINER_NAME", "gcc-ai")

    blob_service = get_blob_service()
    container_client = blob_service.get_container_client(container_name)

    total = sum(len(p["roles"]) for p in PERSONAS)
    count = 0
    failed = []

    for persona in PERSONAS:
        for role in persona["roles"]:
            count += 1
            blob_name = f"questions/{slugify(persona['title'])}_{slugify(role)}.json"

            # Skip if already exists and --only-missing flag is set
            if only_missing:
                try:
                    blob_client = container_client.get_blob_client(blob_name)
                    blob_client.get_blob_properties()
                    print(f"[{count}/{total}] Skipping (exists): {blob_name}")
                    continue
                except Exception:
                    pass

            print(f"[{count}/{total}] Generating: {persona['title']} / {role} -> {blob_name}")

            try:
                questions = generate_for_combo(client, deployment, persona["title"], role)

                data = {
                    "persona": persona["title"],
                    "role": role,
                    "questions": questions,
                }

                blob_client = container_client.get_blob_client(blob_name)
                blob_client.upload_blob(
                    json.dumps(data, indent=2),
                    overwrite=True,
                    content_settings=ContentSettings(content_type="application/json"),
                )

                print(f"  ✓ Uploaded {blob_name}")

            except Exception as e:
                print(f"  ✗ Failed: {e}")
                # Retry once
                print(f"  ↻ Retrying...")
                time.sleep(3)
                try:
                    questions = generate_for_combo(client, deployment, persona["title"], role)
                    data = {
                        "persona": persona["title"],
                        "role": role,
                        "questions": questions,
                    }
                    blob_client = container_client.get_blob_client(blob_name)
                    blob_client.upload_blob(
                        json.dumps(data, indent=2),
                        overwrite=True,
                        content_settings=ContentSettings(content_type="application/json"),
                    )
                    print(f"  ✓ Retry succeeded: {blob_name}")
                except Exception as e2:
                    print(f"  ✗ Retry also failed: {e2}")
                    failed.append(blob_name)

            # Small delay to avoid rate limits
            time.sleep(2)

    print(f"\nDone! Generated {count} question sets.")
    if failed:
        print(f"Failed: {failed}")


if __name__ == "__main__":
    main()
