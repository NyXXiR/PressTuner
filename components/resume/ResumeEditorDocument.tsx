import { createElement, type ReactNode } from "react";
import Image from "next/image";

import {
  formatItemPeriod,
  type EligibilityContent,
  type IdentityContent,
  type ItemContent,
  type ItemsContent,
  type NarrativeBlockType,
  type NarrativeContent,
  type ResumeSection,
  type SectionContent,
  type SectionLayout,
  type TagsContent,
} from "@/domain/resume-documents/model";
import {
  formatCareerDuration,
  groupCareerDetails,
  resolveCareerDurationMonths,
  sortExperienceItems,
} from "@/domain/resume-documents/experiencePresentation";

const detailTypeLabels = { project: "프로젝트", responsibility: "상시 책임", improvement: "개선", troubleshooting: "문제 해결" } as const;
const isCareerTimelineSectionId = (sectionId: string) => sectionId === "experience" || sectionId === "projects";

export type ResumeEditorSection = ResumeSection & { hidden?: boolean };

export type ResumeEditorHeaderProps = {
  company: string;
  role: string;
};

export function ResumeEditorHeader({ company, role }: ResumeEditorHeaderProps) {
  return <header className="resume-print-header"><p className="resume-print-company">{company}</p><p className="resume-print-role">{role}</p></header>;
}

export function ResumeEditorSection({ currentMonth, relatedWorkItems = [], section }: {
  currentMonth?: string;
  relatedWorkItems?: ItemContent[];
  section: ResumeEditorSection;
}) {
  if (section.hidden) return null;
  const content = section.content;
  const experienceContent = section.id === "experience" && section.kind === "items" ? content as ItemsContent : null;
  const careerDuration = experienceContent && currentMonth
    ? formatCareerDuration(resolveCareerDurationMonths(experienceContent.items, experienceContent.careerDurationOverrideMonths, currentMonth))
    : null;
  const splittable = section.kind === "items"
    ? (content as ItemsContent).items.length > 1
    : section.kind === "narrative"
      ? ((content as NarrativeContent).blocks?.length ?? (content as NarrativeContent).body.split(/\n\s*\n/).length) > 1
      : false;
  const heading = section.kind === "identity" ? null : careerDuration
    ? <div className="resume-section-heading"><h2>{section.title}</h2><p data-experience-duration>{careerDuration}</p></div>
    : <h2 className="resume-section-heading">{section.title}</h2>;
  return <section className="resume-document-section" data-resume-section-id={section.id} data-resume-splittable={splittable || undefined} data-section-kind={section.kind}>
    <ResumePrintableSectionBody content={content} heading={heading} layout={section.layout ?? "standard"} relatedWorkItems={relatedWorkItems} section={section} />
  </section>;
}

function ResumePrintableSectionBody({ content, heading, layout, relatedWorkItems, section }: {
  content: SectionContent;
  heading: ReactNode;
  layout: SectionLayout;
  relatedWorkItems: ItemContent[];
  section: ResumeEditorSection;
}) {
  if (section.kind === "identity") return <IdentityBody content={content as IdentityContent} layout={layout} />;
  if (section.kind === "eligibility") return <div className="resume-section-opening">{heading}<EligibilityBody content={content as EligibilityContent} /></div>;
  if (section.kind === "narrative") return <NarrativeBody content={content as NarrativeContent} heading={heading} layout={layout} sectionId={section.id} />;
  if (section.kind === "tags") return <div className="resume-section-opening">{heading}<div className={`resume-tags resume-layout-${layout}`}>{(content as TagsContent).items.map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}</div></div>;
  const itemContent = content as ItemsContent;
  if (section.id === "projects") return <GroupedCareerBody content={itemContent} heading={heading} relatedWorkItems={relatedWorkItems} />;
  const items = isCareerTimelineSectionId(section.id) ? sortExperienceItems(itemContent.items, itemContent.sortDirection) : itemContent.items;
  const [firstItem, ...remainingItems] = items;
  return <>{firstItem
    ? <div className="resume-section-opening">{heading}<div className={`resume-items resume-layout-${layout}`}><ResumeItem item={firstItem} /></div></div>
    : heading}
  {remainingItems.length > 0 && <div className={`resume-items resume-items-continuation resume-layout-${layout}`}>{remainingItems.map((item) => <ResumeItem item={item} key={item.id} />)}</div>}</>;
}

function IdentityBody({ content, layout }: { content: IdentityContent; layout: SectionLayout }) {
  const contactItems = [
    content.email && { label: "EMAIL", value: content.email },
    content.phone && { label: "PHONE", value: content.phone },
    content.location && { label: "LOCATION", value: content.location },
    ...content.links.filter(Boolean).map((value) => ({ label: "LINK", value })),
  ].filter(Boolean) as Array<{ label: string; value: string }>;
  const factItems = [content.birthDate && `생년월일 ${content.birthDate}`, content.gender && `성별 ${content.gender}`].filter(Boolean) as string[];
  return <div className={`resume-identity resume-layout-${layout}`} data-photo-position="right">
    <div className="resume-identity-copy">
      <div className="resume-identity-heading"><h2>{content.name || "이름 미입력"}</h2></div>
      {contactItems.length > 0 && <div className="resume-contact-grid">{contactItems.map((item, index) => <div className="resume-contact-item" key={`${item.label}-${item.value}-${index}`}><span>{item.label}</span><p>{item.value}</p></div>)}</div>}
      {factItems.length > 0 && <div className="resume-facts">{factItems.map((item) => <span key={item}>{item}</span>)}</div>}
    </div>
    {content.photo && <Image alt={`${content.name || "지원자"} 증명사진`} className="resume-profile-photo" height={640} loading="eager" src={content.photo} unoptimized width={480} />}
  </div>;
}

function EligibilityBody({ content }: { content: EligibilityContent }) {
  const facts = [content.militaryStatus && `병역 ${content.militaryStatus}`, content.veteranStatus && `보훈 ${content.veteranStatus}`, content.disabilityStatus && `장애 ${content.disabilityStatus}`, content.employmentProtectionStatus && `취업보호 ${content.employmentProtectionStatus}`].filter(Boolean) as string[];
  return facts.length > 0 ? <div className="resume-facts">{facts.map((item) => <span key={item}>{item}</span>)}</div> : <p className="resume-empty-copy">선택한 정보가 없습니다.</p>;
}

function ResumeItem({ item, detailLabel }: { item: ItemContent; detailLabel?: string }) {
  return <article className="resume-item" data-resume-item-id={item.id}>
    <p className="resume-item-period">{formatItemPeriod(item)}</p>
    <div className="resume-item-copy"><div className="resume-item-header">{detailLabel && <p className="resume-detail-type">{detailLabel}</p>}<h3 className="resume-item-title">{item.title}</h3><p className="resume-item-subtitle">{[item.relatedWorkTitle, item.subtitle].filter(Boolean).join(" · ")}</p></div><p className="resume-item-body">{item.body}</p></div>
  </article>;
}

function GroupedCareerBody({ content, heading, relatedWorkItems }: { content: ItemsContent; heading: ReactNode; relatedWorkItems: ItemContent[] }) {
  const grouped = groupCareerDetails(relatedWorkItems, content.items, { detailSortDirection: content.sortDirection });
  const detail = (item: ItemContent) => <ResumeItem detailLabel={detailTypeLabels[item.detailType ?? "project"]} item={item} key={item.id} />;
  const groups = [
    ...grouped.employmentGroups.filter((group) => group.details.length).map((group) => ({ id: group.work.id, title: group.work.title, meta: `${group.work.subtitle} · ${formatItemPeriod(group.work)}`, items: group.details, warning: false })),
    ...(grouped.independentDetails.length > 0 ? [{ id: "independent", title: "독립 프로젝트", meta: "", items: grouped.independentDetails, warning: false }] : []),
    ...(grouped.unresolvedDetails.length > 0 ? [{ id: "unresolved", title: "연결 확인 필요", meta: "", items: grouped.unresolvedDetails, warning: true }] : []),
  ];
  const [firstGroup, ...remainingGroups] = groups;
  if (!firstGroup) return <>{heading}</>;
  const [firstItem, ...remainingFirstItems] = firstGroup.items;
  const renderGroup = (group: typeof firstGroup, items: ItemContent[], showHeading: boolean, key = group.id) => <section className="resume-career-group" key={key}>
    {showHeading && <div className={`resume-group-heading${group.warning ? " resume-warning" : ""}`}><h3>{group.title}</h3>{group.meta && <p>{group.meta}</p>}</div>}
    <div className="resume-career-detail-list">{items.map(detail)}</div>
  </section>;
  return <>
    <div className="resume-section-opening">{heading}{renderGroup(firstGroup, [firstItem], true, `${firstGroup.id}-opening`)}</div>
    {(remainingFirstItems.length > 0 || remainingGroups.length > 0) && <div className="resume-career-detail-groups resume-career-detail-groups-continuation">
      {remainingFirstItems.length > 0 && renderGroup(firstGroup, remainingFirstItems, false, `${firstGroup.id}-continuation`)}
      {remainingGroups.map((group) => renderGroup(group, group.items, true))}
    </div>}
  </>;
}

function NarrativeBody({ content, heading, layout, sectionId }: { content: NarrativeContent; heading: ReactNode; layout: SectionLayout; sectionId: string }) {
  const textStyles: Record<NarrativeBlockType, string> = { p: "resume-narrative-p", h1: "resume-narrative-h1", h2: "resume-narrative-h2", h3: "resume-narrative-h3", h4: "resume-narrative-h4", h5: "resume-narrative-h5", h6: "resume-narrative-h6" };
  const paragraphs = content.blocks?.length
    ? content.blocks.map((block) => createElement(block.type, { className: textStyles[block.type], "data-resume-paragraph-id": block.id, key: block.id }, block.runs.map((run, index) => run.bold ? <strong key={index}>{run.text}</strong> : run.text)))
    : content.body.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((paragraph, index) => <p className="resume-narrative-p" data-resume-paragraph-id={`${sectionId}-legacy-${index + 1}`} key={index}>{paragraph}</p>);
  const [firstParagraph, ...remainingParagraphs] = paragraphs;
  return <>
    <div className="resume-section-opening">{heading}<div className={`resume-narrative resume-layout-${layout}`}>{firstParagraph}</div></div>
    {remainingParagraphs.length > 0 && <div className={`resume-narrative resume-narrative-continuation resume-layout-${layout}`}>{remainingParagraphs}</div>}
  </>;
}
