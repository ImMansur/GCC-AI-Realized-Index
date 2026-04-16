import os
import base64
from io import BytesIO
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from app.firebase import get_db


def _get_blob_service():
    """Create a BlobServiceClient from SAS URL or account URL."""
    from azure.storage.blob import BlobServiceClient

    sas_url = os.getenv("AZURE_STORAGE_SAS_URL", "")
    if sas_url:
        return BlobServiceClient(account_url=sas_url)

    account_url = os.getenv("AZURE_STORAGE_ACCOUNT_URL", "")
    if not account_url:
        raise RuntimeError("AZURE_STORAGE_SAS_URL or AZURE_STORAGE_ACCOUNT_URL not configured")
    from azure.identity import DefaultAzureCredential
    credential = DefaultAzureCredential()
    return BlobServiceClient(account_url=account_url, credential=credential)

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, Color
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
    PageBreak,
    KeepTogether,
)
from reportlab.platypus.flowables import Flowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY

router = APIRouter()

# ── Colours ──
EY_YELLOW = HexColor("#ffe600")
EY_DARK = HexColor("#1a1a2e")
EY_DARK_LIGHTER = HexColor("#2d2d4e")
GREY = HexColor("#666666")
GREY_LIGHT = HexColor("#999999")
WHITE = HexColor("#ffffff")
BLACK = HexColor("#000000")
LIGHT_GREY = HexColor("#f0f0f0")
BG_CREAM = HexColor("#fafaf8")
ACCENT_GREEN = HexColor("#2e7d32")
ACCENT_AMBER = HexColor("#b8960c")
ACCENT_RED = HexColor("#c62828")


class _ScoreBar(Flowable):
    """A horizontal bar showing score out of 5 with fill colour."""

    def __init__(self, score: float, width: float = 100, height: float = 10):
        super().__init__()
        self.score = score
        self.bar_width = width
        self.bar_height = height
        self.width = width
        self.height = height

    def draw(self):
        c = self.canv
        # Background
        c.setFillColor(HexColor("#e8e8e8"))
        c.roundRect(0, 0, self.bar_width, self.bar_height, 3, fill=1, stroke=0)
        # Fill
        fill_w = (self.score / 5.0) * self.bar_width
        if self.score >= 4:
            colour = ACCENT_GREEN
        elif self.score >= 2.5:
            colour = ACCENT_AMBER
        else:
            colour = ACCENT_RED
        c.setFillColor(colour)
        c.roundRect(0, 0, fill_w, self.bar_height, 3, fill=1, stroke=0)


# ── Request models ──
class DimScore(BaseModel):
    dimension_id: int
    dimension_name: str
    score: float
    weight: float
    weighted_score: float


class RoadmapAction(BaseModel):
    number: int
    title: str
    description: str
    timeline: str


class JourneyPhase(BaseModel):
    months: str
    phase_title: str
    milestones: list[str]


class RoadmapData(BaseModel):
    target_score: float
    target_stage_name: str
    actions: list[RoadmapAction]
    journey: list[JourneyPhase]
    projected_landing: str


class AnswerOption(BaseModel):
    value: int
    label: str
    description: str


class AnswerDetail(BaseModel):
    dimension_id: int
    dimension_name: str
    question: str
    selected_option: int
    option_label: str
    option_description: str
    all_options: Optional[list[AnswerOption]] = None


class DiagnosticRequest(BaseModel):
    user_name: str
    user_email: str
    persona: str
    role: str
    composite_score: float
    dimensions: list[DimScore]
    insights: Optional[dict] = None
    roadmap: Optional[RoadmapData] = None
    answers: Optional[list[AnswerDetail]] = None


def _get_stage(score: float) -> str:
    if score < 2:
        return "Stage 1 — AI Aware"
    if score < 3:
        return "Stage 2 — AI Embedded"
    if score < 4:
        return "Stage 3 — AI Scaled"
    if score < 4.5:
        return "Stage 4 — AI Native"
    return "Stage 5 — AI Realized"


# ── Role-specific GCC median benchmarks (static fallback) ──
_BENCHMARK_MEDIAN: dict[str, float] = {
    "GCC Head": 3.1, "Managing Director (MD)": 3.1,
    "Chief Operating Officer (COO)": 3.1, "Strategy Officer": 3.2,
    "CIO": 3.0, "CTO/VP Engineering": 3.0, "Head of IT": 3.0,
    "Head of Data": 3.0, "Chief Data Officer": 3.0, "Analytics Lead": 3.0,
    "Data Scientists": 3.2, "ML Engineers": 3.2, "AI CoE": 3.2,
    "CHRO / VP HR": 2.8, "Head of L&D": 2.8, "Talent Acquisition": 2.7,
    "Head of Finance Ops": 3.0, "Operations Lead": 2.9,
    "Head of Procurement & Supply Chain": 3.0,
    "General Counsel": 2.4, "Head of Risk": 2.6, "Compliance Officer": 2.4,
}
_DEFAULT_MEDIAN = 2.9


def _get_median(role: str) -> float:
    """Return the benchmark median for a role, using live data when available."""
    try:
        from app.routes.benchmarks import compute_benchmark
        data = compute_benchmark(role)
        return data["median"]
    except Exception:
        return _BENCHMARK_MEDIAN.get(role, _DEFAULT_MEDIAN)


def _build_pdf(req: DiagnosticRequest) -> bytes:
    """Build a professional EY-branded PDF report."""
    buf = BytesIO()
    page_w, page_h = A4
    margin = 22 * mm

    def _footer(canvas, doc):
        canvas.saveState()
        # Yellow line
        canvas.setStrokeColor(EY_YELLOW)
        canvas.setLineWidth(1.5)
        canvas.line(margin, 12 * mm, page_w - margin, 12 * mm)
        # Left text
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(GREY_LIGHT)
        canvas.drawString(margin, 8 * mm, "EY GCC AI Realized Index  |  Confidential")
        # Right text – page number
        canvas.drawRightString(page_w - margin, 8 * mm, f"Page {doc.page}")
        canvas.restoreState()

    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
    )

    usable_w = page_w - 2 * margin
    styles = getSampleStyleSheet()

    # ── Custom styles ──
    s = {}
    s["title"] = ParagraphStyle("_title", fontName="Helvetica-Bold", fontSize=26,
                                textColor=BLACK, spaceAfter=2, leading=30)
    s["subtitle"] = ParagraphStyle("_sub", fontName="Helvetica", fontSize=12,
                                   textColor=GREY, spaceAfter=14, leading=16)
    s["section"] = ParagraphStyle("_sec", fontName="Helvetica-Bold", fontSize=13,
                                  textColor=EY_DARK, spaceBefore=20, spaceAfter=10,
                                  leading=16, borderPadding=(0, 0, 2, 0))
    s["body"] = ParagraphStyle("_body", fontName="Helvetica", fontSize=10,
                               textColor=HexColor("#333333"), leading=15,
                               alignment=TA_JUSTIFY)
    s["bodyBold"] = ParagraphStyle("_bodyB", fontName="Helvetica-Bold", fontSize=10,
                                   textColor=HexColor("#333333"), leading=15)
    s["small"] = ParagraphStyle("_sm", fontName="Helvetica", fontSize=9,
                                textColor=GREY, leading=13)
    s["scoreBig"] = ParagraphStyle("_scoreB", fontName="Helvetica-Bold", fontSize=42,
                                   textColor=EY_DARK, alignment=TA_CENTER, leading=46)
    s["scoreLabel"] = ParagraphStyle("_scoreL", fontName="Helvetica", fontSize=11,
                                     textColor=GREY, alignment=TA_CENTER, spaceAfter=4)
    s["stageLabel"] = ParagraphStyle("_stageL", fontName="Helvetica-Bold", fontSize=12,
                                     textColor=ACCENT_AMBER, alignment=TA_CENTER, spaceAfter=6)
    s["dimName"] = ParagraphStyle("_dimN", fontName="Helvetica-Bold", fontSize=10,
                                  textColor=EY_DARK, leading=14)
    s["roadmapTitle"] = ParagraphStyle("_rmT", fontName="Helvetica-Bold", fontSize=11,
                                       textColor=EY_DARK, leading=15, spaceBefore=6, spaceAfter=2)
    s["milestone"] = ParagraphStyle("_mile", fontName="Helvetica", fontSize=9,
                                    textColor=HexColor("#444444"), leading=13,
                                    leftIndent=12)
    s["footer_note"] = ParagraphStyle("_fn", fontName="Helvetica-Oblique", fontSize=8,
                                      textColor=GREY_LIGHT, alignment=TA_CENTER, leading=11)

    elements: list = []
    date_str = datetime.now(timezone.utc).strftime("%d %B %Y")
    stage = _get_stage(req.composite_score)

    # ═══════════════════════════════════════════
    # PAGE 1 — COVER HEADER + EXECUTIVE SUMMARY
    # ═══════════════════════════════════════════

    # ── Brand header bar ──
    header_data = [[
        Paragraph('<font color="#ffe600"><b>EY</b></font>'
                  '&nbsp;&nbsp;<font color="#ffffff">GCC AI Realized Index</font>',
                  ParagraphStyle("_hdr", fontName="Helvetica-Bold", fontSize=16,
                                 textColor=WHITE, leading=20)),
        Paragraph(f'<font color="#999999">{date_str}</font>',
                  ParagraphStyle("_hdrR", fontName="Helvetica", fontSize=9,
                                 textColor=GREY_LIGHT, alignment=TA_RIGHT)),
    ]]
    header_tbl = Table(header_data, colWidths=[usable_w * 0.7, usable_w * 0.3])
    header_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), EY_DARK),
        ("TOPPADDING", (0, 0), (-1, -1), 14),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
        ("LEFTPADDING", (0, 0), (0, -1), 16),
        ("RIGHTPADDING", (-1, 0), (-1, -1), 16),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROUNDEDCORNERS", [6, 6, 0, 0]),
    ]))
    elements.append(header_tbl)

    # Yellow accent line
    accent_data = [["" ]]
    accent_tbl = Table(accent_data, colWidths=[usable_w])
    accent_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), EY_YELLOW),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("HEIGHT", (0, 0), (-1, -1), 4),
    ]))
    elements.append(accent_tbl)
    elements.append(Spacer(1, 16))

    # ── Report title ──
    elements.append(Paragraph("GARIX Assessment Report", s["title"]))
    elements.append(Paragraph("Full Diagnostic & AI Transformation Roadmap", s["subtitle"]))
    elements.append(HRFlowable(width="100%", thickness=0.5, color=LIGHT_GREY, spaceAfter=14))

    # ── Participant details card ──
    info_rows = [
        [Paragraph("<b>PARTICIPANT DETAILS</b>",
                   ParagraphStyle("_inf", fontName="Helvetica-Bold", fontSize=8,
                                  textColor=GREY, leading=10)), "", "", ""],
        [_info_cell("Name", s), Paragraph(req.user_name, s["bodyBold"]),
         _info_cell("Persona", s), Paragraph(req.persona, s["bodyBold"])],
        [_info_cell("Email", s), Paragraph(req.user_email, s["body"]),
         _info_cell("Role", s), Paragraph(req.role, s["body"])],
    ]
    info_tbl = Table(info_rows, colWidths=[usable_w * 0.12, usable_w * 0.38,
                                            usable_w * 0.12, usable_w * 0.38])
    info_tbl.setStyle(TableStyle([
        ("SPAN", (0, 0), (-1, 0)),
        ("BACKGROUND", (0, 0), (-1, -1), BG_CREAM),
        ("TOPPADDING", (0, 0), (-1, 0), 10),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 4),
        ("TOPPADDING", (0, 1), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#e0e0e0")),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]))
    elements.append(info_tbl)
    elements.append(Spacer(1, 18))

    # ── Composite Score — centred highlight ──
    score_colour = ACCENT_GREEN if req.composite_score >= 4 else (
        ACCENT_AMBER if req.composite_score >= 2.5 else ACCENT_RED)
    score_inner = [[
        Paragraph("COMPOSITE GARIX SCORE",
                  ParagraphStyle("_scH", fontName="Helvetica-Bold", fontSize=9,
                                 textColor=GREY_LIGHT, alignment=TA_CENTER,
                                 leading=12, spaceAfter=4)),
    ], [
        Paragraph(f'<font color="#ffe600" size="40"><b>{req.composite_score:.1f}</b></font>'
                  f'<font color="#999999" size="14"> / 5.0</font>',
                  ParagraphStyle("_scV", fontName="Helvetica-Bold", fontSize=40,
                                 textColor=EY_YELLOW, alignment=TA_CENTER, leading=46)),
    ], [
        Paragraph(stage,
                  ParagraphStyle("_scS", fontName="Helvetica-Bold", fontSize=12,
                                 textColor=EY_YELLOW, alignment=TA_CENTER)),
    ]]
    score_tbl = Table(score_inner, colWidths=[usable_w])
    score_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), EY_DARK),
        ("TOPPADDING", (0, 0), (-1, 0), 16),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 16),
        ("TOPPADDING", (0, 1), (-1, 1), 4),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 4),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROUNDEDCORNERS", [6, 6, 6, 6]),
    ]))
    elements.append(score_tbl)
    elements.append(Spacer(1, 6))

    # ── India GCC benchmark note ──
    _median = _get_median(req.role)
    elements.append(Paragraph(
        f'<font color="#999999">India GCC Median: {_median:.1f} / 5.0  •  '
        f'Your score is <b><font color="{score_colour.hexval()}">'
        f'{"above" if req.composite_score > _median else "at" if req.composite_score == _median else "below"}'
        f'</font></b> the benchmark</font>',
        ParagraphStyle("_bench", fontName="Helvetica", fontSize=9,
                       textColor=GREY, alignment=TA_CENTER, leading=12),
    ))
    elements.append(Spacer(1, 14))

    # ═══════════════════════════════════════════
    # DIMENSION SCORES — with visual score bars
    # ═══════════════════════════════════════════
    elements.append(_section_heading("Dimension Scores"))

    dim_header = [
        Paragraph("<b>#</b>", s["small"]),
        Paragraph("<b>Dimension</b>", s["small"]),
        Paragraph("<b>Score</b>", s["small"]),
        "",  # bar
        Paragraph("<b>Weight</b>", s["small"]),
        Paragraph("<b>Weighted</b>", s["small"]),
    ]
    dim_rows = [dim_header]
    for d in req.dimensions:
        dim_rows.append([
            Paragraph(str(d.dimension_id), s["small"]),
            Paragraph(d.dimension_name, s["dimName"]),
            Paragraph(f"<b>{d.score:.1f}</b>/5", s["body"]),
            _ScoreBar(d.score, width=80, height=8),
            Paragraph(f"{d.weight}×", s["body"]),
            Paragraph(f"{d.weighted_score:.1f}", s["body"]),
        ])

    dim_table = Table(dim_rows, colWidths=[28, usable_w * 0.30, 48, 90, 48, 52])
    dim_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), EY_DARK),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("GRID", (0, 0), (-1, -1), 0.4, HexColor("#e0e0e0")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, BG_CREAM]),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (2, 0), (2, -1), "CENTER"),
        ("ALIGN", (4, 0), (5, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]))
    elements.append(dim_table)
    elements.append(Spacer(1, 6))

    # Weakest / strongest callout
    sorted_dims = sorted(req.dimensions, key=lambda d: d.score)
    weakest = sorted_dims[0]
    strongest = sorted_dims[-1]
    elements.append(Paragraph(
        f'<font color="#c62828">⬇ Lowest:</font> <b>{weakest.dimension_name}</b> ({weakest.score:.1f}/5)'
        f'&nbsp;&nbsp;&nbsp;&nbsp;'
        f'<font color="#2e7d32">⬆ Highest:</font> <b>{strongest.dimension_name}</b> ({strongest.score:.1f}/5)',
        ParagraphStyle("_hl", fontName="Helvetica", fontSize=9, textColor=HexColor("#444444"),
                       alignment=TA_CENTER, leading=13),
    ))
    elements.append(Spacer(1, 10))

    # ═══════════════════════════════════════
    # AI-GENERATED INSIGHTS
    # ═══════════════════════════════════════
    if req.insights:
        elements.append(_section_heading("AI-Generated Insights"))
        for d in req.dimensions:
            dim_insights = req.insights.get(str(d.dimension_id), [])
            if not dim_insights:
                continue
            # Dimension sub-header
            score_tag = (f'<font color="{ACCENT_GREEN.hexval()}">●</font>' if d.score >= 4
                         else f'<font color="{ACCENT_AMBER.hexval()}">●</font>' if d.score >= 2.5
                         else f'<font color="{ACCENT_RED.hexval()}">●</font>')
            elements.append(Paragraph(
                f'{score_tag}  <b>{d.dimension_name}</b>  '
                f'<font color="#999999" size="9">(Score: {d.score:.1f}/5)</font>',
                s["bodyBold"],
            ))
            for insight in dim_insights:
                elements.append(Paragraph(
                    f'<font color="#999999">—</font>&nbsp;&nbsp;{insight}',
                    ParagraphStyle("_ins", fontName="Helvetica", fontSize=9,
                                   textColor=HexColor("#444444"), leading=13,
                                   leftIndent=14, spaceBefore=1, spaceAfter=1),
                ))
            elements.append(Spacer(1, 6))

    # ═══════════════════════════════════════
    # AI TRANSFORMATION ROADMAP
    # ═══════════════════════════════════════
    if req.roadmap:
        rm = req.roadmap
        elements.append(PageBreak())
        elements.append(_section_heading("AI Transformation Roadmap"))

        # Target card
        target_inner = [[
            Paragraph(
                f'<font size="9" color="#999999">TARGET SCORE</font><br/>'
                f'<font size="22" color="#ffe600"><b>{rm.target_score:.1f}</b></font>'
                f'<font size="10" color="#999999"> / 5.0</font>',
                ParagraphStyle("_tgt", fontName="Helvetica-Bold", fontSize=22,
                               textColor=EY_YELLOW, alignment=TA_CENTER, leading=28)),
            Paragraph(
                f'<font size="9" color="#999999">TARGET STAGE</font><br/>'
                f'<font size="14" color="#ffffff"><b>{rm.target_stage_name}</b></font>',
                ParagraphStyle("_tgs", fontName="Helvetica-Bold", fontSize=14,
                               textColor=WHITE, alignment=TA_CENTER, leading=20)),
        ]]
        target_tbl = Table(target_inner, colWidths=[usable_w * 0.5, usable_w * 0.5])
        target_tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), EY_DARK),
            ("TOPPADDING", (0, 0), (-1, -1), 14),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("LINEBEFORE", (1, 0), (1, 0), 0.5, HexColor("#444444")),
            ("ROUNDEDCORNERS", [6, 6, 6, 6]),
        ]))
        elements.append(target_tbl)
        elements.append(Spacer(1, 6))
        elements.append(Paragraph(rm.projected_landing,
                                  ParagraphStyle("_proj", fontName="Helvetica-Oblique",
                                                 fontSize=9, textColor=GREY,
                                                 alignment=TA_CENTER, leading=13)))
        elements.append(Spacer(1, 16))

        # ── Immediate Actions ──
        elements.append(Paragraph(
            '<font color="#1a1a2e"><b>Immediate Actions</b></font>',
            ParagraphStyle("_actH", fontName="Helvetica-Bold", fontSize=12,
                           textColor=EY_DARK, spaceBefore=4, spaceAfter=8)))

        for action in rm.actions:
            timeline_color = (EY_YELLOW if "30" in action.timeline
                              else HexColor("#ffd54f") if "60" in action.timeline
                              else HexColor("#ffecb3"))
            act_rows = [[
                Paragraph(
                    f'<font size="16" color="#ffe600"><b>{action.number}</b></font>',
                    ParagraphStyle("_aN", fontName="Helvetica-Bold", fontSize=16,
                                   textColor=EY_YELLOW, alignment=TA_CENTER)),
                Paragraph(
                    f'<b>{action.title}</b><br/>'
                    f'<font size="8" color="#999999">{action.timeline.upper()}</font>',
                    ParagraphStyle("_aT", fontName="Helvetica-Bold", fontSize=11,
                                   textColor=EY_DARK, leading=15)),
            ], [
                "",
                Paragraph(action.description,
                          ParagraphStyle("_aD", fontName="Helvetica", fontSize=9,
                                         textColor=HexColor("#555555"), leading=13)),
            ]]
            act_tbl = Table(act_rows, colWidths=[36, usable_w - 36])
            act_tbl.setStyle(TableStyle([
                ("SPAN", (0, 0), (0, 1)),
                ("BACKGROUND", (0, 0), (0, -1), EY_DARK),
                ("BACKGROUND", (1, 0), (1, -1), BG_CREAM),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("VALIGN", (0, 0), (0, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (0, -1), "CENTER"),
                ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#e0e0e0")),
                ("ROUNDEDCORNERS", [4, 4, 4, 4]),
            ]))
            elements.append(KeepTogether([act_tbl, Spacer(1, 6)]))

        elements.append(Spacer(1, 10))

        # ── 6-Month Journey ──
        elements.append(Paragraph(
            '<font color="#1a1a2e"><b>6-Month Transformation Journey</b></font>',
            ParagraphStyle("_jH", fontName="Helvetica-Bold", fontSize=12,
                           textColor=EY_DARK, spaceBefore=4, spaceAfter=8)))

        journey_header = [
            Paragraph("<b>Period</b>", ParagraphStyle("_jTh", fontName="Helvetica-Bold",
                       fontSize=9, textColor=WHITE)),
            Paragraph("<b>Phase</b>", ParagraphStyle("_jTh2", fontName="Helvetica-Bold",
                       fontSize=9, textColor=WHITE)),
            Paragraph("<b>Key Milestones</b>", ParagraphStyle("_jTh3", fontName="Helvetica-Bold",
                       fontSize=9, textColor=WHITE)),
        ]
        journey_rows = [journey_header]
        for phase in rm.journey:
            milestones_text = "<br/>".join(f"→ {m}" for m in phase.milestones)
            journey_rows.append([
                Paragraph(f'<b>Month {phase.months}</b>',
                          ParagraphStyle("_jM", fontName="Helvetica-Bold", fontSize=9,
                                         textColor=EY_DARK, leading=13)),
                Paragraph(phase.phase_title, s["body"]),
                Paragraph(milestones_text,
                          ParagraphStyle("_jMi", fontName="Helvetica", fontSize=9,
                                         textColor=HexColor("#444444"), leading=13)),
            ])
        journey_tbl = Table(journey_rows, colWidths=[usable_w * 0.15, usable_w * 0.25, usable_w * 0.60])
        journey_tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), EY_DARK),
            ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.4, HexColor("#e0e0e0")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, BG_CREAM]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ROUNDEDCORNERS", [4, 4, 4, 4]),
        ]))
        elements.append(journey_tbl)

    # ═══════════════════════════════════════
    # CLOSING FOOTER
    # ═══════════════════════════════════════
    elements.append(Spacer(1, 28))
    elements.append(HRFlowable(width="100%", thickness=0.5, color=LIGHT_GREY, spaceAfter=8))
    elements.append(Paragraph(
        "This report was auto-generated by the GARIX Assessment Platform powered by EY. "
        "For the comprehensive 63-question diagnostic and tailored consulting engagement, "
        "please contact your EY team.",
        s["footer_note"],
    ))
    elements.append(Spacer(1, 4))
    elements.append(Paragraph(
        "© 2026 EY Global Consulting  |  AI &amp; Digital Transformation",
        ParagraphStyle("_copy", fontName="Helvetica", fontSize=7,
                       textColor=GREY_LIGHT, alignment=TA_CENTER),
    ))

    doc.build(elements, onFirstPage=_footer, onLaterPages=_footer)
    return buf.getvalue()


def _info_cell(label: str, s: dict) -> Paragraph:
    """Small grey label for the participant card."""
    return Paragraph(f'<font color="#999999" size="8">{label}</font>',
                     ParagraphStyle("_lbl", fontName="Helvetica", fontSize=8,
                                    textColor=GREY_LIGHT))


def _section_heading(text: str):
    """Yellow-left-bordered section heading."""
    tbl = Table([[Paragraph(f"<b>{text}</b>",
                            ParagraphStyle("_secH", fontName="Helvetica-Bold", fontSize=13,
                                           textColor=EY_DARK, leading=16))]],
                colWidths=["*"])
    tbl.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBEFORE", (0, 0), (0, -1), 3, EY_YELLOW),
        ("BACKGROUND", (0, 0), (-1, -1), BG_CREAM),
    ]))
    return KeepTogether([Spacer(1, 10), tbl, Spacer(1, 8)])


def _send_email(req: DiagnosticRequest, pdf_bytes: bytes):
    """Send acknowledgement to user and notification to admin for diagnostic request."""
    from azure.communication.email import EmailClient

    connection_string = os.getenv("AZURE_COMMUNICATION_CONNECTION_STRING", "")
    if not connection_string:
        raise RuntimeError("AZURE_COMMUNICATION_CONNECTION_STRING not configured")

    client = EmailClient.from_connection_string(connection_string)
    admin_email = "immansurjavid@gmail.com"
    sender = "DoNotReply@d807c9f2-5ac4-48ae-b2fe-23c1ce765976.azurecomm.net"

    stage = _get_stage(req.composite_score)
    date_str = datetime.now(timezone.utc).strftime("%d %B %Y")

    # ── USER ACKNOWLEDGEMENT EMAIL ──
    user_subject = "We've received your Full Diagnostic request"
    user_plain = f"""EY GCC AI Realized Index — Diagnostic Request Received
{"=" * 55}

Date: {date_str}

Dear {req.user_name},

Thank you for requesting the Full 63-Question Diagnostic Report.

Our team has received your request and will be in touch with you shortly to schedule your comprehensive diagnostic engagement.

YOUR ASSESSMENT SNAPSHOT
  Composite Score:  {req.composite_score:.1f} / 5.0
  Maturity Stage:   {stage}
  Persona:          {req.persona}
  Role:             {req.role}

If you have any questions in the meantime, feel free to reply to this email.

Best regards,
EY GARIX Assessment Platform
EY Global Consulting | AI & Digital Transformation
"""

    user_html = f"""\
<html>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:20px 0;">
    <tr>
      <td align="center">
        <table width="640" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:4px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:#1a1a2e;padding:24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size:20px;font-weight:bold;color:#ffe600;">EY</span>
                    <span style="font-size:16px;color:#ffffff;margin-left:8px;">GCC AI Realized Index</span>
                  </td>
                  <td align="right" style="color:#999999;font-size:12px;">{date_str}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td style="background-color:#ffe600;height:4px;"></td></tr>
          <tr>
            <td style="padding:28px 32px 8px 32px;">
              <h1 style="margin:0;font-size:20px;color:#1a1a2e;font-weight:600;">Request Received</h1>
              <p style="margin:6px 0 0 0;font-size:13px;color:#888888;">Your full diagnostic request has been submitted successfully</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px 32px;">
              <p style="margin:0;font-size:14px;color:#333333;line-height:1.6;">
                Dear {req.user_name},<br><br>
                Thank you for requesting the <strong>Full 63-Question Diagnostic Report</strong>. Our team has received your request and will be in touch with you shortly to schedule your comprehensive diagnostic engagement.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 16px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#1a1a2e;border-radius:6px;">
                <tr>
                  <td align="center" style="padding:20px;">
                    <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#999999;">Your GARIX Score</p>
                    <p style="margin:8px 0 4px 0;font-size:36px;font-weight:bold;color:#ffe600;">{req.composite_score:.1f}<span style="font-size:16px;color:#999999;"> / 5.0</span></p>
                    <p style="margin:0;font-size:13px;color:#cccccc;">{stage}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffde6;border-left:4px solid #ffe600;border-radius:2px;">
                <tr>
                  <td style="padding:12px 16px;font-size:13px;color:#666666;">
                    Our consulting team will reach out to you to discuss next steps for your comprehensive 63-question AI maturity diagnostic.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #eeeeee;">
              <p style="margin:0;font-size:12px;color:#999999;line-height:1.5;">
                Best regards,<br>
                <strong style="color:#1a1a2e;">EY GARIX Assessment Platform</strong><br>
                EY Global Consulting &nbsp;|&nbsp; AI &amp; Digital Transformation
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f5f5f5;padding:16px 32px;">
              <p style="margin:0;font-size:10px;color:#aaaaaa;line-height:1.4;">
                <strong>Confidentiality Notice:</strong> This email and any attachments are confidential and intended solely for the use of the addressee.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""

    # ── ADMIN NOTIFICATION EMAIL ──
    admin_subject = f"[Action Required] Full Diagnostic Request — {req.user_name} | {req.persona}"
    admin_plain = f"""EY GCC AI Realized Index — Full Diagnostic Request
{"=" * 55}

Date: {date_str}

Dear MD,

A participant has requested the full 63-question diagnostic engagement.

PARTICIPANT DETAILS
  Name:      {req.user_name}
  Email:     {req.user_email}
  Persona:   {req.persona}
  Role:      {req.role}

ASSESSMENT SUMMARY
  Composite Score:  {req.composite_score:.1f} / 5.0
  Maturity Stage:   {stage}

Please reach out to the participant to schedule the comprehensive diagnostic.

Best regards,
EY GARIX Assessment Platform
"""

    admin_html = f"""\
<html>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:20px 0;">
    <tr>
      <td align="center">
        <table width="640" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:4px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:#1a1a2e;padding:24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size:20px;font-weight:bold;color:#ffe600;">EY</span>
                    <span style="font-size:16px;color:#ffffff;margin-left:8px;">GCC AI Realized Index</span>
                  </td>
                  <td align="right" style="color:#999999;font-size:12px;">{date_str}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td style="background-color:#ffe600;height:4px;"></td></tr>
          <tr>
            <td style="padding:28px 32px 8px 32px;">
              <h1 style="margin:0;font-size:20px;color:#1a1a2e;font-weight:600;">Full Diagnostic Request</h1>
              <p style="margin:6px 0 0 0;font-size:13px;color:#888888;">A participant is requesting the comprehensive 63-question diagnostic</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px 32px;">
              <p style="margin:0;font-size:14px;color:#333333;line-height:1.6;">
                Dear MD,<br><br>
                <strong>{req.user_name}</strong> has requested a full diagnostic review. Please reach out to schedule the engagement.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9f9f9;border-radius:6px;border:1px solid #eeeeee;">
                <tr><td style="padding:16px 20px 8px 20px;"><p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#999999;font-weight:600;">Participant Details</p></td></tr>
                <tr>
                  <td style="padding:4px 20px 16px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr><td width="50%" style="padding:4px 0;font-size:13px;color:#666666;">Name</td><td style="padding:4px 0;font-size:13px;color:#1a1a2e;font-weight:600;">{req.user_name}</td></tr>
                      <tr><td style="padding:4px 0;font-size:13px;color:#666666;">Email</td><td style="padding:4px 0;font-size:13px;color:#1a1a2e;">{req.user_email}</td></tr>
                      <tr><td style="padding:4px 0;font-size:13px;color:#666666;">Persona</td><td style="padding:4px 0;font-size:13px;color:#1a1a2e;font-weight:600;">{req.persona}</td></tr>
                      <tr><td style="padding:4px 0;font-size:13px;color:#666666;">Role</td><td style="padding:4px 0;font-size:13px;color:#1a1a2e;">{req.role}</td></tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 16px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#1a1a2e;border-radius:6px;">
                <tr>
                  <td align="center" style="padding:20px;">
                    <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#999999;">Composite GARIX Score</p>
                    <p style="margin:8px 0 4px 0;font-size:36px;font-weight:bold;color:#ffe600;">{req.composite_score:.1f}<span style="font-size:16px;color:#999999;"> / 5.0</span></p>
                    <p style="margin:0;font-size:13px;color:#cccccc;">{stage}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #eeeeee;">
              <p style="margin:0;font-size:12px;color:#999999;line-height:1.5;">
                Best regards,<br><strong style="color:#1a1a2e;">EY GARIX Assessment Platform</strong>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""

    # Send acknowledgement to user
    user_message = {
        "senderAddress": sender,
        "recipients": {"to": [{"address": req.user_email}]},
        "content": {"subject": user_subject, "plainText": user_plain, "html": user_html},
    }
    client.begin_send(user_message).result()

    # Send notification to admin
    admin_message = {
        "senderAddress": sender,
        "recipients": {"to": [{"address": admin_email}]},
        "content": {"subject": admin_subject, "plainText": admin_plain, "html": admin_html},
    }
    client.begin_send(admin_message).result()


def _upload_to_blob(req: DiagnosticRequest, pdf_bytes: bytes) -> str:
    """Upload the PDF to Azure Blob Storage and return the blob name."""
    from azure.storage.blob import ContentSettings

    container_name = os.getenv("BLOB_CONTAINER_NAME", "gcc-ai")
    blob_service = _get_blob_service()
    container_client = blob_service.get_container_client(container_name)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    safe_name = req.user_name.replace(" ", "_")
    blob_name = f"reports/{safe_name}_{timestamp}.pdf"

    container_client.upload_blob(
        name=blob_name,
        data=pdf_bytes,
        overwrite=True,
        content_settings=ContentSettings(content_type="application/pdf"),
    )
    return blob_name


def _save_report_metadata(req: DiagnosticRequest, blob_name: str):
    """Save report metadata to Firestore for admin retrieval."""
    db = get_db()
    db.collection("diagnostic_reports").add({
        "user_name": req.user_name,
        "user_email": req.user_email,
        "persona": req.persona,
        "role": req.role,
        "composite_score": req.composite_score,
        "stage": _get_stage(req.composite_score),
        "blob_name": blob_name,
        "requested_at": datetime.now(timezone.utc).isoformat(),
    })


def send_survey_completion_emails(
    user_name: str,
    user_email: str,
    persona: str,
    role: str,
    composite_score: float,
    dimensions: list,
    insights: dict | None = None,
    roadmap: dict | None = None,
    answers: list | None = None,
):
    """Build the PDF report and email it to both the user and admin after survey completion."""
    from azure.communication.email import EmailClient

    connection_string = os.getenv("AZURE_COMMUNICATION_CONNECTION_STRING", "")
    if not connection_string:
        return  # silently skip if email not configured

    # Convert raw dicts to Pydantic models expected by _build_pdf
    dim_scores = [DimScore(**d) if isinstance(d, dict) else d for d in dimensions]
    roadmap_data = None
    if roadmap:
        roadmap_data = RoadmapData(**roadmap) if isinstance(roadmap, dict) else roadmap
    answer_details = None
    if answers:
        answer_details = [AnswerDetail(**a) if isinstance(a, dict) else a for a in answers]

    req = DiagnosticRequest(
        user_name=user_name,
        user_email=user_email,
        persona=persona,
        role=role,
        composite_score=composite_score,
        dimensions=dim_scores,
        insights=insights,
        roadmap=roadmap_data,
        answers=answer_details,
    )

    pdf_bytes = _build_pdf(req)

    admin_email = "immansurjavid@gmail.com"
    sender = "DoNotReply@d807c9f2-5ac4-48ae-b2fe-23c1ce765976.azurecomm.net"
    stage = _get_stage(composite_score)
    date_str = datetime.now(timezone.utc).strftime("%d %B %Y")
    safe_name = user_name.replace(" ", "_")
    pdf_b64 = base64.b64encode(pdf_bytes).decode("utf-8")

    # ── Email to USER ──
    user_subject = f"Your GARIX Assessment Report — {stage}"
    user_plain = f"""EY GCC AI Realized Index — Your Assessment Report
{"=" * 50}

Date: {date_str}

Dear {user_name},

Thank you for completing the GARIX AI Maturity Assessment!

YOUR ASSESSMENT SUMMARY
  Composite Score:  {composite_score:.1f} / 5.0
  Maturity Stage:   {stage}
  Persona:          {persona}
  Role:             {role}

Your detailed assessment report is attached as a PDF, including your dimension-level insights and personalized 6-month AI transformation roadmap.

Best regards,
EY GARIX Assessment Platform
EY Global Consulting | AI & Digital Transformation
"""

    user_html = f"""\
<html>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:20px 0;">
    <tr>
      <td align="center">
        <table width="640" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:4px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:#1a1a2e;padding:24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size:20px;font-weight:bold;color:#ffe600;">EY</span>
                    <span style="font-size:16px;color:#ffffff;margin-left:8px;">GCC AI Realized Index</span>
                  </td>
                  <td align="right" style="color:#999999;font-size:12px;">{date_str}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td style="background-color:#ffe600;height:4px;"></td></tr>
          <tr>
            <td style="padding:28px 32px 8px 32px;">
              <h1 style="margin:0;font-size:20px;color:#1a1a2e;font-weight:600;">Your GARIX Assessment Report</h1>
              <p style="margin:6px 0 0 0;font-size:13px;color:#888888;">Thank you for completing the AI Maturity Assessment</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px 32px;">
              <p style="margin:0;font-size:14px;color:#333333;line-height:1.6;">
                Dear {user_name},<br><br>
                Thank you for completing the GARIX AI Maturity Assessment. Your personalized report is ready.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 16px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#1a1a2e;border-radius:6px;">
                <tr>
                  <td align="center" style="padding:20px;">
                    <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#999999;">Composite GARIX Score</p>
                    <p style="margin:8px 0 4px 0;font-size:36px;font-weight:bold;color:#ffe600;">{composite_score:.1f}<span style="font-size:16px;color:#999999;"> / 5.0</span></p>
                    <p style="margin:0;font-size:13px;color:#cccccc;">{stage}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffde6;border-left:4px solid #ffe600;border-radius:2px;">
                <tr>
                  <td style="padding:12px 16px;font-size:13px;color:#666666;">
                    📎 Your detailed GARIX assessment report is attached as a PDF, including dimension-level insights, benchmarks, and your personalized 6-month AI transformation roadmap.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #eeeeee;">
              <p style="margin:0;font-size:12px;color:#999999;line-height:1.5;">
                Best regards,<br>
                <strong style="color:#1a1a2e;">EY GARIX Assessment Platform</strong><br>
                EY Global Consulting &nbsp;|&nbsp; AI &amp; Digital Transformation
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f5f5f5;padding:16px 32px;">
              <p style="margin:0;font-size:10px;color:#aaaaaa;line-height:1.4;">
                <strong>Confidentiality Notice:</strong> This email and any attachments are confidential and intended solely for the use of the addressee.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""

    # ── Email to ADMIN ──
    admin_subject = f"[GARIX Completed] {user_name} | {persona} — Score {composite_score:.1f}"
    admin_plain = f"""EY GCC AI Realized Index — Assessment Completed
{"=" * 50}

Date: {date_str}

Dear Admin,

{user_name} has completed the GARIX AI Maturity Assessment. Please find the participant details and assessment summary below.

PARTICIPANT DETAILS
  Name:      {user_name}
  Email:     {user_email}
  Persona:   {persona}
  Role:      {role}

ASSESSMENT SUMMARY
  Composite Score:  {composite_score:.1f} / 5.0
  Maturity Stage:   {stage}

The detailed assessment report is attached as a PDF.

Best regards,
EY GARIX Assessment Platform
"""

    admin_html = f"""\
<html>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:20px 0;">
    <tr>
      <td align="center">
        <table width="640" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:4px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:#1a1a2e;padding:24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size:20px;font-weight:bold;color:#ffe600;">EY</span>
                    <span style="font-size:16px;color:#ffffff;margin-left:8px;">GCC AI Realized Index</span>
                  </td>
                  <td align="right" style="color:#999999;font-size:12px;">{date_str}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td style="background-color:#ffe600;height:4px;"></td></tr>
          <tr>
            <td style="padding:28px 32px 8px 32px;">
              <h1 style="margin:0;font-size:20px;color:#1a1a2e;font-weight:600;">Assessment Completed</h1>
              <p style="margin:6px 0 0 0;font-size:13px;color:#888888;">A participant has completed the GARIX AI Maturity Assessment</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px 32px;">
              <p style="margin:0;font-size:14px;color:#333333;line-height:1.6;">
                Dear Admin,<br><br>
                <strong>{user_name}</strong> has completed the GARIX AI Maturity Assessment. Please find the participant details and assessment summary below.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9f9f9;border-radius:6px;border:1px solid #eeeeee;">
                <tr><td style="padding:16px 20px 8px 20px;"><p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#999999;font-weight:600;">Participant Details</p></td></tr>
                <tr>
                  <td style="padding:4px 20px 16px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr><td width="50%" style="padding:4px 0;font-size:13px;color:#666666;">Name</td><td style="padding:4px 0;font-size:13px;color:#1a1a2e;font-weight:600;">{user_name}</td></tr>
                      <tr><td style="padding:4px 0;font-size:13px;color:#666666;">Email</td><td style="padding:4px 0;font-size:13px;color:#1a1a2e;">{user_email}</td></tr>
                      <tr><td style="padding:4px 0;font-size:13px;color:#666666;">Persona</td><td style="padding:4px 0;font-size:13px;color:#1a1a2e;font-weight:600;">{persona}</td></tr>
                      <tr><td style="padding:4px 0;font-size:13px;color:#666666;">Role</td><td style="padding:4px 0;font-size:13px;color:#1a1a2e;">{role}</td></tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 16px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#1a1a2e;border-radius:6px;">
                <tr>
                  <td align="center" style="padding:20px;">
                    <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#999999;">Composite GARIX Score</p>
                    <p style="margin:8px 0 4px 0;font-size:36px;font-weight:bold;color:#ffe600;">{composite_score:.1f}<span style="font-size:16px;color:#999999;"> / 5.0</span></p>
                    <p style="margin:0;font-size:13px;color:#cccccc;">{stage}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffde6;border-left:4px solid #ffe600;border-radius:2px;">
                <tr><td style="padding:12px 16px;font-size:13px;color:#666666;">📎 The detailed GARIX report is attached as a PDF.</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #eeeeee;">
              <p style="margin:0;font-size:12px;color:#999999;line-height:1.5;">
                Best regards,<br><strong style="color:#1a1a2e;">EY GARIX Assessment Platform</strong>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""

    client = EmailClient.from_connection_string(connection_string)
    attachment = {
        "name": f"GARIX_Report_{safe_name}.pdf",
        "contentType": "application/pdf",
        "contentInBase64": pdf_b64,
    }

    # Send to user
    user_message = {
        "senderAddress": sender,
        "recipients": {"to": [{"address": user_email}]},
        "content": {"subject": user_subject, "plainText": user_plain, "html": user_html},
        "attachments": [attachment],
    }
    client.begin_send(user_message).result()

    # Send to admin
    admin_message = {
        "senderAddress": sender,
        "recipients": {"to": [{"address": admin_email}]},
        "content": {"subject": admin_subject, "plainText": admin_plain, "html": admin_html},
        "attachments": [attachment],
    }
    client.begin_send(admin_message).result()


@router.post("/diagnostic/request")
async def request_diagnostic(req: DiagnosticRequest):
    """Save diagnostic request metadata and send notification emails."""
    try:
        _save_report_metadata(req, "")

        # Send acknowledgement to user + notification to admin
        _send_email(req, b"")

        return {"status": "ok", "message": "Diagnostic request sent successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
