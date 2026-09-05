// The public pages' door to the annotation layer: the list is fetched (it is
// small, and the hook is already in every blog chunk), and the LAYER — the
// popover, the painter, the confirm dialog it drags in — arrives only when
// there is something to paint or somebody who can write. A visitor reading a
// post with no author's notes downloads none of it.
import { Suspense } from "react";
import { lazySurface } from "../lazySurface.tsx";
import { useAnnotations } from "./useAnnotations.ts";

const AnnotationLayer = lazySurface(() => import("./AnnotationLayer.tsx"));

export default function AnnotationsMount({
  path,
  host,
  canEdit,
  scope,
}: {
  path: string;
  host: HTMLElement | null;
  canEdit: boolean;
  scope: "r" | "p" | "l" | "d";
}) {
  const annotations = useAnnotations(path);
  if (!canEdit && (!annotations || annotations.length === 0)) return null;
  return (
    <Suspense fallback={null}>
      <AnnotationLayer path={path} host={host} canEdit={canEdit} scope={scope} />
    </Suspense>
  );
}
