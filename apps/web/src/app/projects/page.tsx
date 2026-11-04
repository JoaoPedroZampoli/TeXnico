import type { Metadata } from "next";
import { desc, eq, getDb, project, projectMember, user } from "@texcollab/db";
import { ProjectsDashboard } from "@/components/projects/ProjectsDashboard";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Projetos" };
export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const me = await requireUser("/projects");
  const rows = await getDb()
    .select({
      id: project.id,
      name: project.name,
      updatedAt: project.updatedAt,
      role: projectMember.role,
      lastOpenedAt: projectMember.lastOpenedAt,
      ownerName: user.name,
    })
    .from(projectMember)
    .innerJoin(project, eq(project.id, projectMember.projectId))
    .innerJoin(user, eq(user.id, project.ownerId))
    .where(eq(projectMember.userId, me.id))
    .orderBy(desc(project.updatedAt));

  return (
    <ProjectsDashboard
      user={{ id: me.id, name: me.name, email: me.email, image: me.image ?? null }}
      projects={rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString(), lastOpenedAt: r.lastOpenedAt?.toISOString() ?? null }))}
    />
  );
}
