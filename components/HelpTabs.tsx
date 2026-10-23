"use client";

import { Tabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

export function HelpTabs({ roles, flow, ai }: { roles: ReactNode; flow: ReactNode; ai: ReactNode }) {
  return (
    <Tabs.Root defaultValue="roles">
      <Tabs.List className="pills pills--plain" aria-label="Help topics" style={{ marginBottom: 24 }}>
        <Tabs.Tab value="roles" className="pill" render={(props, state) => <button {...props} aria-selected={state.active} />}>
          <Icon name="users" size={14} />
          Roles &amp; permissions
        </Tabs.Tab>
        <Tabs.Tab value="flow" className="pill" render={(props, state) => <button {...props} aria-selected={state.active} />}>
          <Icon name="listChecks" size={14} />
          Grading workflow
        </Tabs.Tab>
        <Tabs.Tab value="ai" className="pill" render={(props, state) => <button {...props} aria-selected={state.active} />}>
          <Icon name="sparkles" size={14} />
          How AI is used
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="roles">{roles}</Tabs.Panel>
      <Tabs.Panel value="flow">{flow}</Tabs.Panel>
      <Tabs.Panel value="ai">{ai}</Tabs.Panel>
    </Tabs.Root>
  );
}
