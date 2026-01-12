import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import Flex from "~/components/Flex";
import useStores from "~/hooks/useStores";

function UniverseSelector() {
    const { universes, ui } = useStores();
    const { t } = useTranslation();

    const allUniverses = universes.sorted;

    // Don't show if there's only one universe
    if (allUniverses.length <= 1) {
        return null;
    }

    return (
        <Container gap={4}>
            <Item
                $active={!ui.currentUniverseId}
                onClick={() => ui.setCurrentUniverseId(undefined)}
            >
                {t("All")}
            </Item>
            {allUniverses.map((universe) => (
                <Item
                    key={universe.id}
                    $active={ui.currentUniverseId === universe.id}
                    onClick={() => ui.setCurrentUniverseId(universe.id)}
                >
                    {universe.name}
                </Item>
            ))}
        </Container>
    );
}

const Container = styled(Flex)`
  padding: 0 12px 12px;
  overflow-x: auto;
  flex-shrink: 0;

  &::-webkit-scrollbar {
    display: none;
  }
  scrollbar-width: none;
`;

const Item = styled.button<{ $active: boolean }>`
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  white-space: nowrap;
  background: ${(props) =>
        props.$active ? props.theme.sidebarControlHoverBackground : "transparent"};
  color: ${(props) =>
        props.$active ? props.theme.text : props.theme.textTertiary};
  transition: all 0.1s ease;
  user-select: none;

  &:hover {
    background: ${s("sidebarControlHoverBackground")};
    color: ${s("text")};
  }
`;

export default observer(UniverseSelector);
