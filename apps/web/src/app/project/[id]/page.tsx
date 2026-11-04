import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq, getDb, project, projectMember } from "@texcollab/db";
import { ProjectEditor } from "@/components/editor/ProjectEditor";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

async function load(projectId: string, userId: string) {
  const rows = await getDb()
    .select({ name: project.name, role: projectMember.role })
    .from(projectMember)
    .innerJoin(project, eq(project.id, projectMember.projectId))
    .where(and(eq(projectMember.projectId, projectId), eq(projectMember.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const rows = await getDb().select({ name: project.name }).from(project).where(eq(project.id, id)).limit(1);
  return { title: rows[0]?.name ?? "Projeto" };
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireUser(`/project/${id}`);
  const data = await load(id, me.id);
  if (!data) notFound();
  await getDb()
    .update(projectMember)
    .set({ lastOpenedAt: new Date() })
    .where(and(eq(projectMember.projectId, id), eq(projectMember.userId, me.id)));
  return (
    <ProjectEditor
      key={id}
      projectId={id}
      projectName={data.name}
      role={data.role}
      me={{ id: me.id, name: me.name, image: me.image ?? null }}
    />
  );
}
